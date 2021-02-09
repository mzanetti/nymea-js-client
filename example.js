var NymeaClient = require("./nymeaclient.js")
const readline = require('readline');

var nymea = new NymeaClient("localhost", 2223)

let thingClasses = {}
let things = {}

nymea.on("connected", function() {
    console.log("Connected to nymea")

    console.log("Fetching thingclasses");
    let getThingClasses = nymea.sendCommand("Integrations.GetThingClasses")
    getThingClasses.on("finished", function(reply) {
        console.log("ThingClasses received", reply.thingClasses.length)
        for (let i = 0; i < reply.thingClasses.length; i++) {
            let thingClass = reply.thingClasses[i]
            // Convert stateTypes from a list to a map for easier lookup
            let stateTypes = {};
            for (let j = 0; j < thingClass.stateTypes.length; j++) {
                let stateType = thingClass.stateTypes[j];
                stateTypes[stateType.id] = stateType;
            }
            thingClass.stateTypes = stateTypes;

            // Convert actionTyes from a list to a map or easier lookup
            let actionTypes = {};
            for (let j = 0; j < thingClass.actionTypes.length; j++) {
                let actionType = thingClass.actionTypes[j];
                actionTypes[actionType.id] = actionType;
            }
            thingClass.actionTypes = actionTypes;

            // TODO: same for eventTypes

            thingClasses[thingClass.id] = thingClass
        }
    });

    console.log("Fetching things");
    let getThings = nymea.sendCommand("Integrations.GetThings");
    getThings.on("finished", function(reply) {
        console.log("Configured things:");
        for (let i = 0; i < reply.things.length; i++) {
            things[reply.things[i].id] = reply.things[i]
            let thing = reply.things[i];
            let thingClass = thingClasses[thing.thingClassId]
            console.log("Thing:", thing.name, "(" + thingClass.name + ")");
            // Convert states from a list to a map for easier lookup
            let states = {};
            for (let j = 0; j < thing.states.length; j++) {
                let state = thing.states[j]
                states[state.stateTypeId] = state;
                console.log("- State:", thingClass.stateTypes[state.stateTypeId].name, "=", state.value)
            }
            thing["states"] = states;
        }
        console.log("Total thing count:", reply.things.length)

        // Turning on all lights as an example
        turnOnAllLights();
    });

    let integrationsNotifications = nymea.registerNotificationHandler("Integrations");
    integrationsNotifications.on("notification", function(notification, params) {
//        console.log("notification received", notification)
        if (notification == "Integrations.StateChanged") {
            let thing = things[params.thingId];
            let thingClass = thingClasses[thing.thingClassId]
            console.log("Thing", thing.name, "changed state", thingClass.stateTypes[params.stateTypeId].name, "from", thing.states[params.stateTypeId].value, "to", params.value)
            thing.states[params.stateTypeId].value = params.value
        }
    });

});

nymea.on("authenticationRequired", function() {
    console.log("Authentication required");
    console.log("Username:");
    let user
    let rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
    rl.on('line', function(line){
        if (user == undefined) {
            user = line
            console.log("Password:")
            return;
        }
        nymea.authenticate(user, line, "nymea-js-example-client")
    });
});


nymea.connect();

function turnOnAllLights() {
    console.log("Turning on all lights");
    // Iterating over all things to find light devices
    for (thingId in things) {
        let thing = things[thingId];
        let thingClass = thingClasses[thing.thingClassId];
        // Check if the thingClass implements the "light" interface
        // See interface doc: https://nymea.io/documentation/developers/integrations/interfaces
        if (thingClass.interfaces.includes("light")) {
            console.log("Found light:", thing.name)
            
            // Find power action type id. Given the thingClass implements the "light" interface, we can be sure there is a power action
            let powerActionTypeId
            for (actionTypeId in thingClass.actionTypes) {
                if (thingClass.actionTypes[actionTypeId].name == "power") {
                    powerActionTypeId = actionTypeId;
                    break;
                }
            }
            
            // Compose action parameters.
            // For state change actions that only have one parameter, the paramTypeId will be the same as the actionTypeId.
            // This might not be the case for actions with multiple parameters (e.g. notify has title and body params)
            // In such a case, the correct paramTypeIds need to be obtained from the paramTypes in the actionType
            let powerOnParam = {}
            powerOnParam["paramTypeId"] = powerActionTypeId;
            powerOnParam["value"] = true;
            
            // Compose the command parameters for Integrations.ExecuteAction
            let params = {};
            params["thingId"] = thing.id;
            params["actionTypeId"] = powerActionTypeId;
            params["params"] = [];
            params.params.push(powerOnParam);
            
            console.log("Sending power on action to", thing.name)
            let powerOnAction = nymea.sendCommand("Integrations.ExecuteAction", params)
            powerOnAction.on("finished", function(reply) {
                if (reply.thingError == "ThingErrorNoError") {
                    console.log("Power on action finished successfully");
                } else {
                    console.warn("Power on action failed:", reply.thingError, reply.displayMessage);
                }
            });
        }
    } 
}
