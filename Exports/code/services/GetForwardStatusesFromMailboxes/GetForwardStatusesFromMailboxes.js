function GetForwardStatusesFromMailboxes(req, resp){
    var _access_id = req.params.access_id;
    var _password = req.params.password;
    var _fwIDs = req.params.fwIDs;
    var _start_utc = req.params.start_utc;
    var _end_utc = req.params.end_utc;

    var callTime = new Date();
    log("GetForwardStatuses called at: " + callTime);

    var successMsg = "";
    var statusCount = 0;

    var getForwardStatusesCallback = function(err, data){
        var updateIdpRawMessages = function(message){
            var collection = ClearBlade.Collection({collectionName:"IdpRawMessages"});
            // log("Data passed to update: " + JSON.stringify(message));
            var newData = {
                "mt_status_timestamp": timestamp_rfc3339(message.StateUTC),
                "msg_id": message.ForwardMessageID,
                "mt_status_id": message.State,
                "mt_status_desc": getFwdStatus(message.State),
                "mt_is_closed": message.IsClosed,
                "mt_refno": message.ReferenceNumber,
                "mt_error_id": message.ErrorID,
                "access_id": _access_id
            };
            var updateRowCallback = function(err, qResult) {
                if (err) {
                    resp.error(err);
                } else {
                    log("Updated status of MT message " + newData.msg_id + ":" + getFwdStatus(message.State));
                    notifyIdpForwardStateChange(message.ForwardMessageID + ":" + getFwdStatus(message.State));
                }
            };
            var updateRow = function(item_id) {
                var qMsgRow = ClearBlade.Query({collectionName:"IdpRawMessages"});
                qMsgRow.equalTo("item_id", item_id);
                qMsgRow.update(newData, updateRowCallback);
            };
            var msgIdCallback = function(err, qResult) {
                if(err){
                    resp.error(err);
                } else if (qResult.DATA.length > 0) {
                    log("MT message " + newData.msg_id + " found in IdpRawMessages.");
                    if (qResult.DATA[0].mt_status_id !== newData.msg_status_id) {
                       log("MT message " + newData.msg_id + "state changed from " + qResult.DATA[0].mt_status_id + " to " + newData.msg_status_id);
                       updateRow(qResult.DATA[0].item_id);
                    } else {
                        log("MT message " + newData.msg_id + " state has not changed.");
                    }
                }
            };
            // TODO: set up query to update row
            var qMsgInCol = ClearBlade.Query({collectionName:"IdpRawMessages"});
            qMsgInCol.equalTo("msg_id", newData.msg_id);
            qMsgInCol.equalTo("mo_msg", false);
            qMsgInCol.fetch(msgIdCallback);
        };

        var updateIdpRestApiCalls = function(data) {
            var collection = ClearBlade.Collection({collectionName:"IdpRestApiCalls"});
            var newRow = {
                "call_time": callTime,
                "api_operation": "get_forward_statuses",
                "success": (data.ErrorID === 0),
                "error_id": data.ErrorID,
                "more_messages": data.More,
                "messages_count": statusCount,
                "next_start_utc": data.NextStartUTC,
                "access_id": _access_id
            };
            var newRowCallback = function(err, collectionData) {
                if(err){
                    resp.error(collectionData);
                } else {
                    log("IdpRestApiCalls collection item added: " + JSON.stringify(collectionData));
                }
            };
            collection.create(newRow, newRowCallback);
        };

        if(err) {
            resp.error(data);
        } else {
            // log(data.Messages.length + " messages retrieved.");
            var messageCount = 0;
            var byteCount = 0;
            if (data.ErrorID > 0) {
                resp.error(getErrorMessage(data.ErrorID));
            } else if (data.Statuses !== null) {
                for (var i=0; i < data.Statuses.length; i++) {
                    statusCount += 1;
                    byteCount += data.Statuses[i].OTAMessageSize;
                    updateIdpRawMessages(data.Statuses[i]);
                }
                successMsg = "Updated " + data.Statuses.length + " statuses.";
            } else {
                successMsg = "No statuses to retrieve.";
            }
            updateIdpRestApiCalls(data);
            if (data.More) {
                log("More statuses pending retrieval.");
                // TODO: trigger next GetForwardStatuses call but avoid duplicating checks
            }
        }
    };

    ClearBlade.init({request:req});

    var getWatermarks = function(access_id) {
        var api_options = {};

        if (typeof _fwIDs !== "undefined" && _fwIDs !== "") {
            log("Using parameter fwIDs=" + _fwIDs);
            api_options.fwIDs = _fwIDs;
        } else {
            log("No fwIDs specified. Attempting to retrieve unclosed MT messages from IdpRawMessages.");
            var qUnclosedCallback = function(err, qResult) {
                if (err) {
                    resp.error(err);
                } else if (qResult.DATA.length > 0) {
                    _fwIDs = "";     // avoid starting the string with "undefined"
                    for (var i=0; i < qResult.DATA.length; i++) {
                        _fwIDs += qResult.DATA[i].msg_id;
                        if (i < qResult.DATA.length - 1) {
                            _fwIDs += ",";
                        }
                    }
                } else {
                    log("No open MT messages for " + access_id + " in IdpRawMessages.  Leaving fwIDs undefined.");
                }
            };
            var qUnclosed = ClearBlade.Query({collectionName:"IdpRawMessages"});
            qUnclosed.notEqualTo("mt_is_closed", true);
            qUnclosed.equalTo("mo_msg", false);
            qUnclosed.equalTo("access_id", _access_id);
            qUnclosed.fetch(qUnclosedCallback);
        }
        if (typeof _fwIDs !== "undefined" && _fwIDs !== "") {
            api_options.fwIDs = _fwIDs;
            log("Unclosed message query retrieved " + access_id + " fwIDs=" + api_options.fwIDs);
        }

        if (typeof _start_utc !== "undefined" && _start_utc !== "") {     // TODO: improve with check for valid timestamp
            log("Using parameter _start_utc = " + _start_utc);
        } else if(typeof _fwIDs === "undefined" || _fwIDs === "") {
            log("Attempting to fetch next_start_utc since _from_id and _start_utc are not defined.");
            var qNextUtcCallback = function(err, qResult) {
                log("qNextUtc response: " + JSON.stringify(qResult));
                if (err) {
                    resp.error(err);
                } else if(qResult.DATA.length > 0) {
                    _start_utc = qResult.DATA[0].next_start_utc;
                    log("Found next_start_utc = " + _start_utc);
                } else {
                    _start_utc = getIdpDefaultTimestamp();
                    log("No valid next_start_utc found for " + access_id + ". Using " + _start_utc);
                }
            };
            var qNextUtc = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
            qNextUtc.equalTo("api_operation", "get_forward_statuses");
            qNextUtc.equalTo("access_id", _access_id);
            qNextUtc.notEqualTo("next_start_utc", "");
            qNextUtc.descending("item_id");
            qNextUtc.fetch(qNextUtcCallback);
        }
        if (typeof _start_utc !== "undefined" && _start_utc !== "") {
            api_options.start_utc = _start_utc;
            log("Next UTC query retrieved " + access_id + " fwIDs=" + api_options.fwIDs);
        } else if (_fwIDs === "") {
            log("No open MT messages for " + access_id);
        }

        if (_start_utc !== "" && typeof _end_utc !== "undefined" && _end_utc !== "") {  // TODO: check that end_utc > start_utc
            log("Using parameter _end_utc");
            api_options.end_utc = _end_utc;
        }

        if (_fwIDs !== "" || _start_utc !== "") {
            getForwardStatuses(_access_id, _password, getForwardStatusesCallback, api_options);
        }
    };

    // If no accessID provided, loop through available Mailboxes
    if (typeof _access_id !== "undefined" && _access_id !== "") {
        log("Using parameter _access_id.");
        getWatermarks(_access_id);
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
                        _fwIDs = "";
                        _start_utc = "";
                        _end_utc = "";
                    }
                    getWatermarks(_access_id);
                }
            } else {
                log("Unable to determine valid Mailbox.");
                resp.error("Mailboxes collection is empty, cannot get_return_messages.");
            }
        };
        var qMailboxes = ClearBlade.Query({collectionName:"Mailboxes"});
        qMailboxes.fetch(qMailboxesCallback);
    }

    if (successMsg !== "") {
        if (statusCount > 0) {
            log("Sending notification of new MO message(s) received.");
            notifyIdpForwardStateChange(statusCount);
        }
        resp.success(successMsg);
    }
}
