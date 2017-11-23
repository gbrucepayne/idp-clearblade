var getWatermark = function(access_id) {

    log("getWatermark called for " + access_id);
    var watermark = {};

    log("Attempting to fetch next_start_id as high water mark.");
    var qNextIdCallback = function(err, qResult) {
        log("qNextId response: " + JSON.stringify(qResult));
        if (err) {
            resp.error(err);
        } else if(qResult.DATA.length > 0) {
            watermark.from_id = qResult.DATA[0].next_start_id;
            log("Found next_start_id = " + _from_id + " from API call id " + qResult.DATA[0].item_id + " (" + qResult.DATA[0].call_time + ")");
        } else {
            log("No valid next_start_id found. Leaving from_id undefined.");
        }
    };
    var qNextId = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
    qNextId.equalTo("api_operation", "get_return_messages");
    qNextId.equalTo("access_id", access_id);
    qNextId.notEqualTo("next_start_id", -1);
    qNextId.descending("call_time");
    qNextId.fetch(qNextIdCallback);

    if(typeof watermark.from_id === "undefined") {
        log("Attempting to fetch next_start_utc since from_id is not defined.");
        var qNextUtcCallback = function(err, qResult) {
            log("qNextUtc response: " + JSON.stringify(qResult));
            if (err) {
                resp.error(err);
            } else if(qResult.DATA.length > 0) {
                watermark.start_utc = qResult.DATA[0].next_start_utc;
                log("Found next_start_utc = " + watermark.start_utc + " from API call id " + qResult.DATA[0].item_id + " (" + qResult.DATA[0].call_time + ")");
            } else {
                watermark.start_utc = getIdpDefaultTimestamp();
                log("No valid next_start_utc found. Using " + watermark.start_utc);
            }
        };
        var qNextUtc = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
        qNextUtc.equalTo("api_operation", "get_return_messages");
        qNextUtc.equalTo("access_id", access_id);
        qNextUtc.notEqualTo("next_start_utc", "");
        qNextUtc.descending("call_time");
        qNextUtc.fetch(qNextUtcCallback);
    }

    return watermark;
};
