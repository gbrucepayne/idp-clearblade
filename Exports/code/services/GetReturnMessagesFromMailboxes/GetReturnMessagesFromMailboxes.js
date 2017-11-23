function GetReturnMessagesFromMailboxes(req, resp){

    var _access_id = req.params.access_id;
    var _password = req.params.password;
    var _from_id = req.params.from_id;
    var _start_utc = req.params.start_utc;
    var _end_utc = req.params.end_utc;

    var callTime = new Date();
    log("Service GetReturnMessages called at: " + callTime);

    var successMsgs = [];
    var retrievedCount = 0;
    var storedCount = 0;
    var byteCount = 0;
    //var reRetrievedCount = 0;   // reRetrievedCount = retrievedCount - storedCount
    /*
    var api_options = {
        "include_raw_payload": true,
        "include_type": true,
    };*/

    var mailboxes = [];
    var mb_idx = 0;

    var getReturnMessagesCallback = function(err, data){

        log("getReturnMessagesCallback called with " + JSON.stringify(data));
        var updateIdpRawMessages = function(message){
            log("Updating IdpRawMessages collection");
            var collection = ClearBlade.Collection({collectionName:"IdpRawMessages"});
            // log("Data passed to update: " + JSON.stringify(message));
            var base64Payload = base64ArrayBuffer(message.RawPayload);
            // log("Base 64 payload: " + base64Payload);
            var newRow = {
                "timestamp": timestamp_rfc3339(message.ReceiveUTC),
                "msg_id": message.ID,
                "mobile_id": message.MobileID,
                "mo_msg": true,
                "msg_sin": message.SIN,
                "msg_min": (typeof message.Payload !== "undefined") ? message.Payload.MIN:message.RawPayload[0],  // handle null case?
                "msg_rawpayload_b64": base64Payload,
                "json_payload": (typeof message.Payload !== "undefined") ? JSON.stringify(message.Payload):"unknown",
                "msg_size_ota": message.OTAMessageSize,
                "access_id": mailboxes[mb_idx].access_id
            };

            var createItemCallback = function(err, collectionData) {
                if(err){
                    resp.error(collectionData);
                } else {
                    storedCount += 1;
                    byteCount += newRow.OTAMessageSize;
                    log("Stored message ID " + newRow.msg_id);
                }
            };

            var qNewMsgCallback = function(err, qResult){
                if (err){
                    resp.error(qResult);
                } else {
                    if (qResult.DATA.length === 0){    // no matching entry in RawMessages collection
                        collection.create(newRow, createItemCallback);
                    } else {
                        log("Duplicate message found in IdpRawMessages.  Update skipped for msg_id " + newRow.msg_id);
                    }
                }
            };

            var qNewMsg = ClearBlade.Query({collectionName:"IdpRawMessages"});
            qNewMsg.equalTo("msg_id", newRow.msg_id);
            qNewMsg.equalTo("mobile_id", newRow.mobile_id);
            qNewMsg.equalTo("timestamp", newRow.timestamp);
            qNewMsg.fetch(qNewMsgCallback);
        };

        var updateIdpRestApiCalls = function(data) {
            log("Updating IdpRestApiCalls");
            var collection = ClearBlade.Collection({collectionName:"IdpRestApiCalls"});
            var newRow = {
                "call_time": callTime,
                "api_operation": "get_return_messages",
                "success": (data.ErrorID === 0),
                "error_id": data.ErrorID,
                "error_string": getErrorMessage(data.ErrorID),
                "more_messages": data.More,
                "messages_count": retrievedCount,
                "bytes_ota": byteCount,
                "next_start_utc": data.NextStartUTC,
                "next_start_id": data.NextStartID,
                "access_id": mailboxes[mb_idx].access_id
            };
            var newRowCallback = function(err, collectionData) {
                if(err){
                    resp.error(collectionData);
                } else {
                    log("IdpRestApiCalls collection item added: " + JSON.stringify(collectionData));
                }
            };
            log("Next Start ID: " + newRow.next_start_id + " | Next Start UTC: " + newRow.next_start_utc);
            collection.create(newRow, newRowCallback);
        };

        if(err) {
            resp.error("getReturnMessagesCallbackerror: " + JOSN.stringify(data));
        } else {
            var successMsg = "";
            if (data.ErrorID > 0) {
                successMsg = "IDP API error for " + mailboxes[mb_idx].access_id + ": " + getErrorMessage(data.ErrorID);
            } else if (data.Messages !== null) {
                for (var i=0; i < data.Messages.length; i++) {
                    retrievedCount += 1;
                    //byteCount += data.Messages[i].OTAMessageSize; //TODO: determine byte count only from new unique messages
                    log("Parsing: " + JSON.stringify(data.Messages[i]));
                    updateIdpRawMessages(data.Messages[i]);
                    //TODO: add parsing checks for supported messages
                    if (data.Messages[i].Payload !== "undefined") {
                        log("Parsing possible on message " + data.Messages[i].ID);
                    }
                }
                // TODO: push messages, perhaps in MQTT / OneM2M
                successMsg = "Return Messages for " + mailboxes[mb_idx].access_id + "Retrieved: " + retrievedCount + " | Stored: " + storedCount;
            } else {
                successMsg = "No messages to retrieve from " + mailboxes[mb_idx].access_id + ".";
            }
            log(successMsg);
            successMsgs.push(successMsg);
            updateIdpRestApiCalls(data);
            if (data.More) {
                log("More messages pending retrieval.");
                // TODO: trigger next GetReturnMessages call
            }
        }
    };  // getReturnMessagesCallback

    ClearBlade.init({request:req});

    // If no accessID provided, loop through available Mailboxes
    log("Start: getting API access details");
    if (typeof _access_id === "undefined") {
        log("Mailbox accessID not provided. Looping through available Mailboxes.");
        var qMailboxesCallback = function(err, qResult) {
            if (err) {
                resp.error(err);
            } else if (qResult.DATA.length > 0) {
                for (var i=0; i < qResult.DATA.length; i++) {
                    var mb = {};
                    mb.access_id = qResult.DATA[i].access_id;
                    mb.password = qResult.DATA[i].password;
                    mb.api_options = {
                        "include_raw_payload": true,
                        "include_type": true
                    };
                    var watermark = getWatermark(mb.access_id);
                    if (typeof watermark.from_id !== "undefined") {
                        mb.api_options.from_id = watermark.from_id;
                    } else {
                        mb.api_options.start_utc = watermark.start_utc;
                    }
                    mailboxes.push(mb);
                }
            // log("Mailboxes found: " + JSON.stringify(mailboxes));
            } else {
                log("Unable to determine valid Mailbox.");
                resp.error("Mailboxes collection is empty, cannot get_return_messages.");
            }
        };
        var qMailboxes = ClearBlade.Query({collectionName:"Mailboxes"});
        qMailboxes.fetch(qMailboxesCallback);
    }
    // else: validate manual entry parameters _access_id, _password, _start_utc, _end_utc

    for (mb_idx=0; mb_idx < mailboxes.length; mb_idx++) {
        getReturnMessages(mailboxes[mb_idx].access_id, mailboxes[mb_idx].password, getReturnMessagesCallback, mailboxes[mb_idx].api_options);
    }

    if (storedCount > 0) {
        log("Sending notification of new MO message(s) received.");
        notifyIdpReturn(storedCount);
    }

    resp.success(successMsgs[0]);
}
