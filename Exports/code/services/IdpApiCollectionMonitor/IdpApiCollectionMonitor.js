function IdpApiCollectionMonitor(req, resp){

    var maxItemCount = 500;

    // log("IdpApiCollectionMonitor triggered with max item count: " + maxItemCount);

    var deleteRowCallback = function(err, data) {
        if (err) {
            resp.error("remove error: " + JSON.stringify(data));
        } else {
            resp.success(data);
        }
    };
    var deleteOldestRow = function (item_id) {
        log("Collection IdpRestApiCalls exceeded " + maxItemCount + " entries. Deleting row " + item_id);
        var col = ClearBlade.Collection({collectionName:"IdpRestApiCalls"});
        var query = ClearBlade.Query();
        query.equalTo('item_id', item_id);
        col.remove(query, deleteRowCallback);
    };
    var qRowCountCallback = function(err, qResult) {
        // log("qRowCountCallback called with " + qResult.DATA.length + " items.");
        if (err) {
            resp.error("fetch error: " + JSON.stringify(qResult));
        } else if (qResult.DATA.length > maxItemCount) {
            deleteOldestRow(qResult.DATA[0].item_id);
        }
    };

    ClearBlade.init({request:req});

    var qRowCount = ClearBlade.Query({collectionName:"IdpRestApiCalls"});
    qRowCount.ascending("call_time");
    //log("qRowCount ascending:" + JSON.stringify(qRowCount.ascending));
    qRowCount.fetch(qRowCountCallback);
}
