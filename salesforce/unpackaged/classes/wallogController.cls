public with sharing class wallogController {
    
    public void work() {
    
        Wallog__c wallog = Wallog__c.getInstance();
        List<String> logIds = new List<String>();
        DateTime latestStartTime = null;
        String condition = '';
        
        if(wallog.Last_ApexLog_Starttime__c != null)
            condition = ' WHERE Starttime > ' + wallog.Last_ApexLog_Starttime__c.format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');

        String query = 'SELECT Id, LogUserId, Application, Location, Operation, Request, Status, StartTime FROM ApexLog' + condition + ' ORDER BY Starttime ASC LIMIT 10';
        for(ApexLog log : Database.query(query)) {       
         
            logIds.add(log.Id + '|' + log.LogUserId + '|' + 
                log.Application + '|' + 
                log.Location + '|' + 
                EncodingUtil.urlEncode(log.Operation, 'UTF-8') + '|' + 
                log.Request + '|' + 
                EncodingUtil.urlEncode(log.Status, 'UTF-8') + '|' + 
                EncodingUtil.urlEncode(String.valueOf(log.StartTime), 'UTF-8'));
              
            if(latestStartTime == null || log.StartTime > latestStartTime)
                latestStartTime = log.StartTime;
        }
        
        String joinedLogIds = String.join(logIds, ',');
        String baseURL = URL.getSalesforceBaseUrl().toExternalForm();
        baseURL = EncodingUtil.urlEncode(baseURL, 'UTF-8');

        HttpRequest req = new HttpRequest();
        req.setEndpoint('http://li434-73.members.linode.com:6200' + 
                            '/' + baseURL + 
                            '/' + UserInfo.getSessionID() + 
                            '/' + joinedLogIds);
        req.setMethod('GET');
        
        Http h = new Http();
        HttpResponse res = h.send(req);

        // Record the last starttime for next log ship.
        wallog.Last_ApexLog_Starttime__c = latestStartTime;
    }
    
}