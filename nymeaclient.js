var net = require('net');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');

class JsonReply extends EventEmitter {

}

class NotificationHandler extends EventEmitter {
constructor(namespace) {
    super();
    this.namespace = namespace;
}

}

class NymeaClient extends EventEmitter {

constructor(serverAddress, port) {
    super();
    this.address = serverAddress;
    this.port = port;
    this.commandId = 0;
    this.serverUuid = ""
    this.pendingCommands = {};
    this.inputBuffer = "";
    this.token = ""
    this.notificationHandlers = []
}

sendCommand(method, params) {
    let commandId = this.commandId++;
    let command = {};
    command["id"] = commandId
    command["method"] = method;
    command["params"] = params;
    command["token"] = this.token;
    this.client.write(JSON.stringify(command) + "\n");

    let jsonReply = new JsonReply();
    jsonReply.command = command
    this.pendingCommands[commandId] = jsonReply;
    return jsonReply;
}

connect() {
    var option = {
        host: this.address,
        port: this.port
    }

    console.log("Connecting to nymea on " + option.host + ":" + option.port) 
    let client = net.createConnection(option, (function () {
        console.log("TCP socket connected. Starting handshake...");
        let helloReply = this.sendCommand("JSONRPC.Hello", {});
        helloReply.on("finished", (function(reply) {
            console.log("Nymea", reply.version, "initial setup required:", reply.initialSetupRequired, "authentication required:", reply.authenticationRequired)
            this.serverUuid = reply.uuid;
            if (reply.initialSetupRequired) {
                this.emit("initialSetupRequired")
                return;
            }
            if (reply.authenticationRequired) {
                try {
                    let settings = JSON.parse(fs.readFileSync('./config.json'));
                    this.token = settings[reply.uuid]["token"];
                } catch (exception) {
                    // No token in config
                }
                if (this.token != undefined && this.token.length == 0) {
                    this.emit("authenticationRequired")
                    return;
                }
            }
            this.emit("connected")
        }).bind(this));
    }).bind(this));

    client.on('data', (function (data) {
//        console.log('Server return data : ' + data);

        // On large data, we might not get the full JSON packet at once. Append data to an input buffer
        this.inputBuffer += data

        // Try splitting the input data in the boundry of 2 json objects
        let splitIndex = this.inputBuffer.indexOf('}\n{') + 1;
        if (splitIndex <= 0) {
            // Of no package broundry detected, assume all the data is one complete packet (it might not be complete yet)
            splitIndex = this.inputBuffer.length;
        }
        let packet;
        // Try to parse the packet...
        try {
            packet = JSON.parse(this.inputBuffer.slice(0, splitIndex));
        } catch(error) {
            // Parsing of JSON failed. Packet is not complete yet...
//            console.log("incomplete packet", packet, error);
            return;
        }

        // Check if packet is a notification and inform registered handlers
        if (packet.hasOwnProperty("notification")) {
            let namespace = packet.notification.split(".")[0]
            for (var i = 0; i < this.notificationHandlers.length; i++) {
                let handler = this.notificationHandlers[i]
                handler.emit("notification", packet.notification, packet.params)
            }
        } else {
            // If it's not a notifacation, it's a reply to a request
            let jsonReply = this.pendingCommands[packet.id]
            if (jsonReply) {
                // and emit finished on it
                if (packet.status == "error") {
                    console.warn("Invalid command sent:", jsonReply.command.method);
                    console.warn(packet.error);
                    console.log("command was:", JSON.stringify(jsonReply.command));
                }

                jsonReply.emit("finished", packet.params);
            } else {
                console.log("Received a reply but can't find a pending command");
            }
        }

        // Trim the packet we've just parsed from the input buffer
        this.inputBuffer = this.inputBuffer.slice(splitIndex, this.inputBuffer.length);
        if (this.inputBuffer.length > 0) {
          // Input buffer still has data. Relaunching ourselves with the remaining data.
          client.emit("data", "");
        }

    }).bind(this));

    client.on('end', (function () {
        console.log('Client socket disconnect. ');
        this.emit("disconnected")
    }).bind(this));

    client.on('error', function (err) {
        console.error(JSON.stringify(err));
    });

    this.client = client;
}

authenticate(username, password, deviceName) {
    let params = {}
    params["username"] = username;
    params["password"] = password
    params["deviceName"] = deviceName;
    let auth = this.sendCommand("Users.Authenticate", params);
    auth.on("finished", (function(reply) {
        if (!reply.success) {
            console.warn("Authentication failed.");
            this.emit("authenticationRequired");
            return;
        }
        console.log("Authentication successful");
        this.token = reply.token
        let settings = {}
        settings[this.serverUuid] = {};
        settings[this.serverUuid]["token"] = reply.token;
        fs.writeFile('./config.json', JSON.stringify(settings), function(error) {
            if (error) {
               console.warn("Unable to write config file:", error.message);
            }
        })
        this.emit("connected")
    }).bind(this));
}

registerNotificationHandler(namespace) {
   let handler = new NotificationHandler(namespace);
   this.notificationHandlers.push(handler);

   let allNamespaces = []
   for (var i = 0; i < this.notificationHandlers.length; i++) {
       if (allNamespaces.indexOf(this.notificationHandlers[i].namespace) < 0 ) {
           allNamespaces.push(this.notificationHandlers[i].namespace)
       }
   }

   let params = {}
   params["namespaces"] = allNamespaces;
   this.sendCommand("JSONRPC.SetNotificationStatus", params);
   return handler;
}

}


module.exports = NymeaClient;
