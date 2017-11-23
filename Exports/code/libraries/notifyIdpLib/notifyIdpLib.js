var notifyIdpReturn = function(message) {
  var messaging = ClearBlade.Messaging({}, function(){});
  messaging.publish("new_MO_message", message);
};

var notifyIdpForwardStateChange = function(message) {
  var messaging = ClearBlade.Messaging({}, function(){});
  messaging.publish("new_MT_message_state", message);
};

var notifyIdpLocation = function(message) {
    var messaging = ClearBlade.Messaging({}, function(){});
    messaging.publish("new_location", message);
};
