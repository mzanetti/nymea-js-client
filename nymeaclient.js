var net = require('net');
var EventEmitter = require('events').EventEmitter;


class JsonReply extends EventEmitter {

}

class NymeaClient extends EventEmitter {

constructor(serverAddress, port) {
    super();
    this.address = serverAddress;
    this.port = port;
    this.commandId = 0;
    this.pendingCommands = {};
    this.inputBuffer ="";
}

sendCommand(method, params) {
    var commandId = this.commandId++;
    var command = {};
    command["id"] = commandId
    command["method"] = method;
    command["params"] = params;
    this.client.write(JSON.stringify(command) + "\n");

    var jsonReply = new JsonReply();
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
    var client = net.createConnection(option, (function () {
        console.log("TCP socket connected. Starting handshake...");
        var helloReply = this.sendCommand("JSONRPC.Hello", {});
        helloReply.on("finished", (function() {
            this.emit("connected")
        }).bind(this));
    }).bind(this));

    client.on('data', (function (data) {
//        console.log('Server return data : ' + data);

        // On large data, we might not get the full JSON packet at once. Append data to an input buffer
        this.inputBuffer += data

        // Try splitting the input data in the boundry of 2 json objects
        var splitIndex = this.inputBuffer.indexOf('}\n{') + 1;
        if (splitIndex <= 0) {
            // Of no package broundry detected, assume all the data is one complete packet (it might not be complete yet)
            splitIndex = this.inputBuffer.length;
        }
        var packet;
        // Try to parse the packet...
        try {
            packet = JSON.parse(this.inputBuffer.slice(0, splitIndex));
        } catch(error) {
            // Parsing of JSON failed. Packet is not complete yet...
//            console.log("incomplete packet", packet, error);
            return;
        }

        // Find the according request for this reply
        var jsonReply = this.pendingCommands[packet.id]
        if (jsonReply) {
            // and emit finished on it
            // TODO: check if status == success here
            jsonReply.emit("finished", packet.params);
        } else {
            console.log("Received a reply but can't find a pending command");
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

}


module.exports = NymeaClient;
