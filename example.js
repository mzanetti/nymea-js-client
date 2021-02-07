var NymeaClient = require("./nymeaclient.js")

var nymea = new NymeaClient("localhost", 2222)

nymea.on("connected", function() {
    console.log("Connected to nymea")

    console.log("Fetching thingclasses");
    var getThingClasses = nymea.sendCommand("Integrations.GetThingClasses")
    getThingClasses.on("finished", function(reply) {
        console.log("ThingClasses received", reply.thingClasses.length)
    });

    console.log("Fetching things");
    var getThings = nymea.sendCommand("Integrations.GetThings");
    getThings.on("finished", function(reply) {
        console.log("Things received", reply.things.length);
        for (var i = 0; i < reply.things.length; i++) {
            console.log("Thing:", reply.things[i].name)
        }
    });
})

nymea.on("replyReceived", function(commandId, command, reply) {
    console.log("Reply received:", commandId)
});

nymea.connect();
