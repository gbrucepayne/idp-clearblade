function timestamp_rfc3339(timestamp_idp) {
    var rfcTime = timestamp_idp.replace(/ /g,"T") + "+00:00";
    return rfcTime;
}

function timestamp_idp(timestamp_rfc3339) {
    var idpTime = timestamp_rfc3339.replace("T",/ /g).substring(1, 19);
    return idpTime;
}

function getIdpDefaultTimestamp() {
    var date = new Date();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = 0;
    var min = 0;
    var sec = 0;

    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;
    hour = (hour < 10 ? "0" : "") + hour;
    min = (min < 10 ? "0" : "") + min;
    sec = (sec < 10 ? "0" : "") + sec;

    var tsStr = date.getFullYear() + "-" + month + "-" + day + " " +  hour + ":" + min + ":" + sec;
    return tsStr;
}

function getErrorMessage(ErrorID){
    switch (ErrorID) {
        case 0:
            return "API Error: None";
        case 14:
            return "API Error: Invalid Message ID";
        case 16:
            return "API Error: Too many requests";
        case 17:
            return "API Error: Invalid timestamp/watermark";
        case 23:
            return "API Error: Invalid web service parameter";
        case 513:
            return "API Error: Invalid Mobile ID";
        case 514:
            return "API Error: Invalid Mobile Ownership";
        case 21785:
            return "API Error: Authentication Failed";
        case 21786:
            return "API Error: Invalid web service parameter";
        default:
            return "API Error: unknown";
    }
}

function getFwdStatus(state) {
    switch (state) {
        case 0:
            return "SUBMITTED";
        case 1:
            return "RECEIVED";
        case 2:
            return "ERROR";
        case 3:
            return "FAILED";
        case 4:
            return "TIMEOUT";
        case 5:
            return "CANCELLED";
        default:
            return "UNKNOWN";
    }
}

var getReturnMessages = function(access_id, password, callback, api_options){
    var requestObject = ClearBlade.http().Request();
    var URI = "https://api.inmarsat.com/v1/idp/gateway/rest/get_return_messages.json/?access_id=" + access_id + "&password=" + password;
    //var URI = "http://185.87.8.227:8999/GLGW/GWServices_v1/RestMessages.svc/get_return_messages.json/?access_id=" + access_id + "&password=" + password;
    // log("API options passed in: " + JSON.stringify(api_options));
    for (var o in api_options) {
        if (api_options.hasOwnProperty(o)) {
            var optionUri = api_options[o];
            if (typeof api_options[o] === "string") {
                optionUri = optionUri.replace(/ /g, "%20").trim();
            }
            // log("Parsing option:" + o + "=" + optionUri);
            URI += "&" + o + "=" + optionUri;
        }
    }
    var options = {
        uri: URI,
        strictSSL: false,
        headers: {
            'Accept': 'application/json'
        }
    };
    log("Sending API request: " + JSON.stringify(options));
    requestObject.get(options, function(err, response) {
        log("API Response: " + JSON.stringify(response));
        callback(err, JSON.parse(response));
    });
};

var submitForwardMessages = function(access_id, password, messages, callback){
    /* message {
        DestinationID (string),
        RawPayload (byte array),
        UserMessageID (bigint),
        Payload (object)    // Applicable only when using a message definition file on the IDP network gateway
    */
    var requestObject = ClearBlade.http().Request();
    // TODO: check payload structure for SIN/MIN vs raw
    var options = {
        uri: "https://api.inmarsat.com/v1/idp/gateway/rest/submit_messages.json/",
        strictSSL: false,
        headers: {
            'Content-Type': 'application/json'
        },
        body: {
            "accessID": access_id,
            "password": password,
            "messages": messages
        }
    };
    log("Sending API request: " + JSON.stringify(options));
    requestObject.post(options, function(err, response) {
        log("API Response: " + JSON.stringify(response));
        callback(err, JSON.parse(response));
    });
};

var getForwardStatuses = function(access_id, password, callback, api_options) {
    /*
        start_utc,
        end_utc,
        fwIDs
    */
    var requestObject = ClearBlade.http().Request();
    var URI = "https://api.inmarsat.com/v1/idp/gateway/rest/get_forward_statuses.json/?access_id=" + access_id + "&password=" + password;
    // log("API options passed in: " + JSON.stringify(api_options));
    for (var o in api_options) {
        if (api_options.hasOwnProperty(o)) {
            var optionUri = api_options[o];
            if (typeof api_options[o] === "string") {
                optionUri = optionUri.replace(/ /g, "%20").trim();
            }
            // log("Parsing option:" + o + "=" + optionUri);
            URI += "&" + o + "=" + optionUri;
        }
    }
    var options = {
        uri: URI,
        strictSSL: false,
        headers: {
            'Accept': 'application/json'
        }
    };
    log("Sending API request: " + JSON.stringify(options));
    requestObject.get(options, function(err, response) {
        log("API Response: " + JSON.stringify(response));
        callback(err, JSON.parse(response));
    });
};

var pingModem = function(access_id, password, mobile_id, callback) {
    var date = new Date();
    var seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    log("pingModem called at " + seconds + " seconds.");
    var messages = [
        {
            "DestinationID": mobile_id,
            "Payload": {
                "SIN": 0,
                "MIN": 112,
                "Fields": [
                    {
                        "Name": "requestTime",
                        "Value": seconds
                    }
                ]
            }
        }
    ];
    log("Calling submit_messages with: " + JSON.stingify(messages));
    var callCallback = function(err, data) {
        callback(err, data);
    };
    callback("test only", messages);
    //submitForwardMessages(access_id, password, messages, callCallback);
};
