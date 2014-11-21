Eventaully this readme will walk through setting up logstash to log multiple users apex logs from salesforce so you don't miss a drop.

![Screen Shot](http://i.imgur.com/PHZCHjE.png)
![Screen Shot](http://i.imgur.com/IjSpVYS.png)
![Screen Shot](http://i.imgur.com/oFKQRyj.png)

# Setup
sudo apt-get install ant
wget https://na15.salesforce.com/dwnld/SfdcAnt/salesforce_ant_29.0.zip
unzip salesforce_ant_29.0.zip
sudo mv ant-salesforce.jar /usr/share/ant/lib/

edit config.json
set salesforce username/password (append token to password)
edit salesforce/salesforce.properties
set salesforce username/password (append token to password)

# Deploying to Salesforce
cd salesforce
ant deploy -buildfile build.xml -propertyfile salesforce.properties

# Starting REST API
install node.js (nodejs.org)
node web.js

# Logstash & ElasticSearch

# Redis
sudo apt-get install redis-server

