function ParseLocationMessage(req, resp){
    var loc = {};

    var createItemCallback = function (err, qResult) {
        if(err){
            resp.error(JSON.stringify(qResult));
        } else {
            log("Stored asset location " + JSON.stringify(loc));
        }
    };

    var updateItemCallback = function (err, qResult) {
        if(err){
            resp.error(JSON.stringify(qResult));
        } else {
            log("Updated asset location " + JSON.stringify(loc));
        }
    };

    var newAssetLocationCallback = function(err, qResult) {
        log("Calling newAssetLocationCallback");
        if (err) {
            resp.error("fetch error: " + JSON.stringify(qResult));
        } else if (qResult.DATA.length === 0) {
            log("creating new Mobiles entry");
            var collection = ClearBlade.Collection("Mobiles");
            collection.create(loc, createItemCallback);
        } else {
            log("updating existing Mobiles entry");
            q = ClearBlade.Query({collectionName:"Mobiles"});
            q.equalTo("mobile_id", loc.mobile_id);
            q.update(loc, updateItemCallback);
        }
        resp.success("Mobile location updated.");
    };

    var newMsgCallback = function(err, qResult) {
        if (err) {
            resp.error("fetch error: " + JSON.stringify(qResult));
        } else if (qResult.DATA.length > 0) {
            // TODO: validate that the message (SIN & MIN) is a location that can be parsed!!
            log("Parsing message " + qResult.DATA[0].msg_id);
            log("JSON payload: " + qResult.DATA[0].json_payload);
            if (qResult.DATA[0].msg_sin === 255 && qResult.DATA[0].msg_min === 255) {
                loc = getModemLocation(qResult.DATA[0].mobile_id, qResult.DATA[0].json_payload);
            } else if (qResult.DATA[0].msg_sin === 255 && qResult.DATA[0].msg_min === 254) {
                loc = getGlobalSatLocation(qResult.DATA[0].timestamp, qResult.DATA[0].json_payload);
            }
            if (loc.lat !== "undefined") {
                log("ParseLocationMessage received: " + JSON.stringify(loc));

                // Send real-time update via MQTT broker
                log("Sending MQTT notification");
                notifyIdpLocation(JSON.stringify(loc));

                // Update device status/location collection
                var qNewAssetLoc = ClearBlade.Query({collectionName:"Mobiles"});
                qNewAssetLoc.equalTo("mobile_id", loc.mobile_id);
                qNewAssetLoc.fetch(newAssetLocationCallback);
            } else {
                log("No location information received.");
                resp.success("No location information received.");
            }
        }
    };

    ClearBlade.init({request:req});

    // Triggered by new (most recent) message added to IdpRawMessages collection
    var qNewMsg = ClearBlade.Query({collectionName:"IdpRawMessages"});
    qNewMsg.descending("timestamp");
    qNewMsg.fetch(newMsgCallback);

}
