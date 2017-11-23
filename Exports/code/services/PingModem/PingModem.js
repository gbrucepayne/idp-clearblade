function PingModem(req, resp){

    var _access_id = req.params.access_id;
    var _password = req.params.password;
    var _mobile_id = req.params.mobile_id || "01105596SKY37E9";
    var _requestTime = req.params.requestTime;

    var callTime = new Date();
    log("PingModem called at: " + callTime);

    var msg_sin = 0;
    var msg_min = 112;
    var msg_init_state = 0;

    var messageCount = 0;
    var byteCount = 0;

    var pingModemCallback = function(err, dataJresult){

        var successMsg = "";
        data = dataJresult.SubmitForwardMessages_JResult;

        var updateIdpRawMessages = function(message){
            var collection = ClearBlade.Collection({collectionName:"IdpRawMessages"});
            // log("Data passed to update: " + JSON.stringify(message));
            var newRow = {
                "timestamp": callTime,
                "msg_id": message.ForwardMessageID,
                "mobile_id": message.DestinationID,
                "mo_msg": false,
                "msg_sin": msg_sin,
                "msg_min": msg_min,
                "msg_size_ota": message.OTAMessageSize,
                "user_msg_id": message.UserMessageID,
                "mt_status_id": msg_init_state,
                "mt_status_desc": getFwdStatus(msg_init_state),
                "mt_status_timestamp": timestamp_rfc3339(message.StateUTC),
                "mt_is_closed": false,
                "wakeup_period": message.TerminalWakeupPeriod,
                "scheduled_send": (message.TerminalWakeupPeriod > 0 && timestamp_rfc3339(message.ScheduledSendUTC)) || undefined,
                "access_id": _access_id
            };
            // log("newRow: " + JSON.stringify(newRow));
            var callback = function(err, data) {
                if(err){
                    resp.error(data);
                } else {
                    log("Stored MT message ID " + message.ForwardMessageID);

                }
            };
            collection.create(newRow, callback);
        };

        var updateIdpRestApiCalls = function(data) {
            var collection = ClearBlade.Collection({collectionName:"IdpRestApiCalls"});
            var newRow = {
                "call_time": callTime,
                "api_operation": "submit_messages",
                "success": (data.ErrorID === 0),
                "error_id": data.ErrorID,
                "messages_count": messageCount,
                "bytes_ota": byteCount,
                "access_id": _access_id
            };
            var newRowCallback = function(err, data) {
                if(err){
                    resp.error(data);
                } else {
                    log("IdpRestApiCalls collection item added: " + JSON.stringify(data));
                }
            };
            collection.create(newRow, newRowCallback);
        };

        if(err) {
            resp.error(data);
        } else {
            // log(data.Messages.length + " messages retrieved.");
            if (data.ErrorID > 0) {
                resp.error(getErrorMessage(data.ErrorID));
            } else if (data.Submissions !== null) {
                for (var i=0; i < data.Submissions.length; i++) {
                    messageCount += 1;
                    byteCount += data.Submissions[i].OTAMessageSize;
                    updateIdpRawMessages(data.Submissions[i]);
                    log("Sending notification of new MT state received " + data.Submissions[i].ForwardMessageID + ":" + getFwdStatus(msg_init_state));
                    notifyIdpForwardStateChange(data.Submissions[i].ForwardMessageID + ": " + getFwdStatus(msg_init_state));
                }
                successMsg = "Ping request sent to " + _mobile_id + ".";
            }
            log("Submit call time: " + callTime);
            updateIdpRestApiCalls(data);
        }
        // TODO: start timer to check forward message status until complete
        if (successMsg !== "") {
            resp.success(successMsg);
        }
    };

    ClearBlade.init({request:req});

    if (typeof _mobile_id === "undefined" || _mobile_id === "") {
        resp.error("No Mobile ID provided to query.");
    }

    if (typeof _access_id !== "undefined" && _access_id !== "") {
        log("Using parameter _access_id.");
    } else {
        log("Mailbox accessID not provided. Attempting to retrieve from Mobiles collection.");
        var qMobilesCallback = function(err, qResult) {
            var errMsg = "";
            if (err) {
                resp.error(err);
            } else if (qResult.DATA.length > 0) {
                _access_id = qResult.DATA[0].access_id;
                log("Found mailbox " + _access_id + " in Mobiles collection.");
                var qMailboxesCallback = function(err, qResult) {
                    if (err) {
                        resp.error(err);
                    } else if (qResult.DATA.length > 0) {
                        _password = qResult.DATA[0].password;
                    } else {
                        errMsg = "Mailbox " + _access_id + " not found in Mailboxes collection.";
                    }
                };
                var qMailboxes = ClearBlade.Query({collectionName:"Mailboxes"});
                qMailboxes.equalTo("access_id", _access_id);
                qMailboxes.fetch(qMailboxesCallback);

            } else {
                errMsg = "Mobile ID " + _mobile_id + " not found in Mobiles collection.";
            }
            if (errMsg !== "") {
                log(errMsg);
                resp.error(errMsg);
            }
        };
        var qMobiles = ClearBlade.Query({collectionName:"Mobiles"});
        qMobiles.equalTo("mobile_id", _mobile_id);
        qMobiles.fetch(qMobilesCallback);
    }

    ClearBlade.init({request:req});

    // TODO: fix timestamp modulo and check for parameter pass-in
    var seconds = 0;
    if (typeof _requestTime !== "undefined" && _requestTime !== "") {
        log("Using parameter _requestTime = " + _requestTime);
        seconds = _requestTime;
    } else {
        seconds = callTime.getHours() * 3600 + callTime.getMinutes() * 60 + callTime.getSeconds();
    }
    var messages = [
        {
            "DestinationID": _mobile_id,
            "Payload": {
                "SIN": msg_sin,
                "MIN": msg_min,
                "Fields": [
                    {
                        "Name": "requestTime",
                        "Value": seconds
                    }
                ]
            }
        }
    ];

    submitForwardMessages(_access_id, _password, messages, pingModemCallback);
}
