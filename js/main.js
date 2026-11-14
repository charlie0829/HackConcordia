// Entry point: loads every part of the app. Order doesn't matter much since
// the parts talk through events in state.js.
import "./data.js";
import "./map.js";
import "./list.js";
import "./my-request.js";
import "./notifications.js";
import "./auth.js";   // last: it starts the session once everything is listening
