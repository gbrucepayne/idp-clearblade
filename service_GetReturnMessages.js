function GetReturnMessages(req, resp){
    
    var _access_id = req.params.access_id;
    var _password = req.params.password;
    var _from_id = req.params.from_id;
    var _start_utc = req.params.start_utc;
    var _end_utc = req.params.end_utc;
    
    var callTime = new Date();
    log("Service GetReturnMessages called at: " + callTime);
    
    var successMsg = "";
    var retrievedCount = 0;
    var storedCount = 0;
    var byteCount = 0;
    //var reRetrievedCount = 0;   // reRetrievedCount = retrievedCount - storedCount
    
    var api_options = {
        "include_raw_payload": true,
        "include_type": true,
    };

    
    var getReturnMessagesCallback = function(err, data){
        
        log("getReturnMessagesCallback called with " + JSON.stringify(data));
        var updateIdpRawMessages = function(message){
            log("Updating IdpRawMessages collection")
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
                "msg_size_ota": message.OTAMessageSize,
                "access_id": _access_id
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
            log("Updating IdpRestApiCalls")
            var collection = ClearBlade.Collection({collectionName:"IdpRestApiCalls"});
            var newRow = {
                "call_time": callTime,
                "api_operation": "get_return_messages",
                "success": (data.ErrorID === 0),
                "error_id": data.ErrorID,
                "more_messages": data.More,
                "messages_count": retrievedCount,
                "bytes_ota": byteCount,
                "next_start_utc": data.NextStartUTC,
                "next_start_id": data.NextStartID,
                "access_id": _access_id
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
            if (data.ErrorID > 0) {
                resp.error("IDP API error: " + getErrorMessage(data.ErrorID));
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
                successMsg = "Return Messages Retrieved: " + retrievedCount + " | Stored: " + storedCount;
            } else {
                successMsg = "No messages to retrieve.";
            }
            // log("Storing call time: " + callTime);
            updateIdpRestApiCalls(data);
            if (data.More) {
                log("More messages pending retrieval.");
                // TODO: trigger next GetReturnMessages call
            }
        }
    };  // getReturnMessagesCallback
    
    ClearBlade.init({request:req});
    
    var getWatermarks = function(access_id) {
        
        log("getWatermarks called")
        if (typeof _from_id !== "undefined" && _from_id !== "") {
            log("Using parameter _from_id = " + _from_id);
            api_options.from_id = _from_id;
        } else if(typeof _start_utc === "undefined" || _start_utc === "") {
            log("Attempting to fetch next_start_id since _from_id and _start_utc are not defined.");
            var qNextIdCallback = function(err, qResult) {
                // log("qNextId response: " + JSON.stringify(qResult));
                if (err) {
                    resp.error(err);
                } else if(qResult.DATA.length > 0) {
                    _from_id = qResult.DATA[0].next_start_id;
                    log("Found next_start_id = " + _from_id);
                } else {
                    log("No valid next_start_id found. Leaving from_id undefined.");
                }
                if (_from_id !== "") {
                    api_options.from_id = _from_id;
                }
            };
            var qNextId = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
            qNextId.equalTo("api_operation", "get_return_messages");
            qNextId.equalTo("access_id", _access_id);
            qNextId.notEqualTo("next_start_id", -1);
            qNextId.descending("item_id");
            qNextId.fetch(qNextIdCallback);
        }
        
        if (typeof _start_utc !== "undefined" && _start_utc !== "") {     // TODO: improve with check for valid timestamp
            log("Using parameter _start_utc = " + _start_utc);
        } else if(typeof _from_id === "undefined" || _from_id === "") {
            log("Attempting to fetch next_start_utc since _from_id and _start_utc are not defined.");
            var qNextUtcCallback = function(err, qResult) {
                // log("qNextUtc response: " + JSON.stringify(qResult));
                if (err) {
                    resp.error(err);
                } else if(qResult.DATA.length > 0) {
                    _start_utc = qResult.DATA[0].next_start_utc;
                    log("Found next_start_utc = " + _start_utc);
                } else {
                    _start_utc = getIdpDefaultTimestamp();
                    log("No valid next_start_utc found. Using " + _start_utc);
                }
                if (_start_utc !== "") {
                    api_options.start_utc = _start_utc;
                }
            };
            var qNextUtc = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
            qNextUtc.equalTo("api_operation", "get_return_messages");
            qNextUtc.equalTo("access_id", _access_id);
            qNextUtc.notEqualTo("next_start_utc", "");
            qNextUtc.descending("item_id");
            qNextUtc.fetch(qNextUtcCallback);
        }
        
        if (_start_utc !== "" && typeof _end_utc !== "undefined" && _end_utc !== "") {  // TODO: check that end_utc > start_utc
            log("Using parameter _end_utc");
            api_options.end_utc = _end_utc;
        }
        
    };

    // If no accessID provided, loop through available Mailboxes
    log("Start: getting API access details")
    if (typeof _access_id !== "undefined" && _access_id !== "") {
        log("Using parameter _access_id.");
    } else {
        log("Mailbox accessID not provided. Looping through available Mailboxes.");
        var qMailboxesCallback = function(err, qResult) {
            if (err) {
                resp.error(err);
            } else if (qResult.DATA.length > 0) {
                for (var i=0; i < qResult.DATA.length; i++) {
                    _access_id = qResult.DATA[i].access_id;
                    _password = qResult.DATA[i].password;
                    log("Using accessID = " + _access_id);
                    if (i === 0) {
                        log("Using watermark parameters for first mailbox " + _access_id);
                    } else {
                        log("Resetting watermarks for next mailbox " + _access_id);
                        _from_id = "";
                        _start_utc = "";
                        _end_utc = "";
                    }
                    //getWatermarks(_access_id);
                }
            } else {
                log("Unable to determine valid Mailbox.");
                resp.error("Mailboxes collection is empty, cannot get_return_messages.");
            }
        };
        var qMailboxes = ClearBlade.Query({collectionName:"Mailboxes"});
        qMailboxes.fetch(qMailboxesCallback);
    }
    
    getWatermarks(_access_id);
    getReturnMessages(_access_id, _password, getReturnMessagesCallback, api_options);
    
    if (successMsg !== "") {
        if (storedCount > 0) {
            log("Sending notification of new MO message(s) received.");
            notifyIdpReturn(storedCount);
        }
        resp.success(successMsg);
    }
}