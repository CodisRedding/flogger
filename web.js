var express = require("express");
var req = require('request');
var redis = require('redis');
var sf = require('node-salesforce');
var schedule = require('node-schedule');
var config = require('./config.json');
var app = express();
app.use(express.logger());

 /***********************************
  * Resets debug users available
  * log request counts to 20
  ***********************************/
function reset_all_debug_users() {

    console.log('[resetting debug users] ...');
    debugUsers.forEach(function (user) { reset_debug_user(user); });
}

 /***********************************
  * Resets the passed in debug users
  * available log request count to 20
  **********************************/
function reset_debug_user(user_id) {

    console.log('[resetting][' + user_id + ']');
    var options = {
        url: debugUsersInstanceUrl + '/setup/ui/listApexTraces.apexp',
        headers: get_auth_header(debugUsersSession),
        qs: {
            'user_id': user_id,
            'user_logging': 'true'
        }
    }

    req(options, function (error, res, body) {
        if (!error && res.statusCode == 200)
            console.log('[finished][' + user_id + ']');
        else
            console.log('[error][' + user_id + ']');
    });
}

 /**********************************
  * Returns header with passed in
  * session token.
  *********************************/
function get_auth_header(session_id) {
    return headers = { 'Authorization': 'Bearer ' + session_id }
}

 /**********************************
  * Calls a Salesforce VF page that
  * ships off log info to be logged.
  *********************************/
function kickoff_salesforce_shipper() {

    console.log('[kicking off salesforce shipper] ...');
    var options = {
        url: debugUsersInstanceUrl + '/apex/wallog',
        headers: get_auth_header(debugUsersSession)
    }

    req(options, function (error, res, body) {
        if (!error && res.statusCode == 200)
            console.log('[finished][kicking off shipper]');
    });
}

 /**************************************
  * Queries Salesforce for any users
  * that were added to the ApexLogUsers
  * object. Users are then added to
  * the standard debug users list in
  * Salesforce. This also updates any
  * debug options if the user already
  * exists.
  *************************************/
function add_debug_users() {

    console.log('[updating debug users] ...');
    var conn = new sf.Connection({
        loginUrl : config.url
    });

    conn.login(config.username, (config.password + config.token), function(err, userInfo) {
        if (err) { return console.error(err); }
        //console.log(conn.accessToken);
        //console.log(conn.instanceUrl);
        //console.log("User ID: " + userInfo.id);
        //console.log("Org ID: " + userInfo.organizationId);

        debugUsersInstanceUrl = conn.instanceUrl;
        debugUsersSession = conn.accessToken; // good for an hour

        var future = new Date();
        future.setDate(future.getDate() + 1);

    // if works while commented out then remove section
    //    var headers = {
    //        'Authorization': 'Bearer ' + conn.accessToken,
    //        'Content-Type': 'application/json'
    //    }

        conn.query("SELECT UserToLog__c, Apex_Code__c, Apex_Profiling__c, Callout__c, Database__c, System__c, Validation__c, Visualforce__c, Workflow__c FROM ApexLogUsers__c", function(err, result) {
            if (err) { return console.error(err); }
            //console.log("total : " + result.totalSize);
            console.log("[fetched][" + result.records.length + ' users]');

            for(var i=0; i<result.records.length; i++) {
                console.log('[adding/updating][' + result.records[i].UserToLog__c + ']');

                debugUsers.push(result.records[i].UserToLog__c);
                var options = {
                    uri: conn.instanceUrl + '/services/data/v28.0/tooling/sobjects/TraceFlag/' ,
                    method: 'POST',
                    headers: get_auth_header(conn.accessToken),
                    body:   JSON.stringify({
                                ApexCode: result.records[i].Apex_Code__c ,
                                ApexProfiling: result.records[i].Apex_Profiling__c,
                                Callout: result.records[i].Callout__c,
                                Database: result.records[i].Database__c,
                                System: result.records[i].System__c,
                                Validation: result.records[i].Validation__c,
                                VisualForce: result.records[i].Visualforce__c,
                                Workflow: result.records[i].Workflow__c,
                                ExpirationDate: Date.parse(future),
                                TracedEntityId: result.records[i].UserToLog__c
                            })
                }

                req(options, function (error, res, body) {
                    console.log('[finished]');
                });
            }
        });
    });
}

 /*************************************************
  * REST API
  * :url  = Salesforce instance url to grab logs from
  * :sid  = Salesforce session id used for authentication
  * :lids = A comma delimited string of log information.
  *     each log string is made up of pipe delimted string:
  *     log id|user id|application|location|operation|request|status|starttime
  *
  * This API downloads Salesforce logs based on the log
  * log string params passed in. Each downlaoded load
  * is then shipped off to redis for processing by
  * logstash and elastic search. The redis db is
  * assumed to be installed on the same server that
  * this api is running on, along with the default port.
  * This also assumes that a string list named: logstash-apex-logs
  * has been created in redis. This list will be kept to a 10 index
  * minimum for least amount of memory usage while still allowing
  * logstash to pick up new values in time.
  ************************************************/
app.get('/:url/:sid/:lids', function(request, response) {

    //console.log('url: ' + request.params.url);
    //console.log('sid: ' + request.params.sid);
    console.log('lids: ' + request.params.lids);

    log_ids = request.params.lids.split(',');
    log_ids.forEach(function (lid) {

        var log_id = lid.split('|')[0];
        var user_id = lid.split('|')[1];
        var application = lid.split('|')[2];
        var location = lid.split('|')[3];
        var operation = lid.split('|')[4];
        var requ = lid.split('|')[5];
        var status = lid.split('|')[6];
        var starttime = lid.split('|')[7];

        var options = {
            url: request.params.url + '/apexdebug/traceDownload.apexp',
            headers: get_auth_header(request.params.sid),
            qs: { 'id': log_id }
        }

        req(options, function (error, res, body) {
            if (!error && res.statusCode == 200) {
                client = redis.createClient();
                client.on('error', function(err) { console.log('error: ' + err); });

                var fulllog = body + '\n' +
                    application + '^' +
                    location + '^' +
                    operation + '^' +
                    requ + '^' +
                    status + '^' +
                    starttime;

                client.lpush('logstash-apex-logs', fulllog, redis.print);
                client.ltrim('logstash-apex-logs', '0', '10', redis.print);
                client.quit();
            }
        });
    });

    response.send('Fancy meeting you here.');
});

var debugUsers = [];
var debugUsersInstanceUrl = '';
var debugUsersSession = 0;

// First add/update any debug users.
add_debug_users();

 /*************************************************
  * Creates a recurring schedule (recurring time
  * is set in config.json key cron_schedule_add_debug_users)
  * that calls the add_debug_users funcction to ensure
  * that any changes made on the Salesforce end are kept
  * up to date.
  *************************************************/
var jeerb = schedule.scheduleJob(config.cron_schedule_add_debug_users, add_debug_users);

 /*************************************************
  * Calls reset_all_debug_users on a timer. Timer interval is set
  * in config.json key reset_all_users_seconds
  ************************************************/
setInterval(reset_all_debug_users, config.reset_all_users_seconds*1000);

 /*************************************************
  * Calls kickoff_salesforce_shipper a timer. Timer interval is set
  * in config.json key ask_for_logs_seconds
  ************************************************/
setInterval(kickoff_salesforce_shipper, config.ask_for_logs_seconds*1000);

 /*************************************************
  * Start the node server listening on specifed port
  * The port is set in the config.json key nodejs_port
  ************************************************/
app.listen(config.nodejs_port);
console.log("Listening on " + config.nodejs_port);
