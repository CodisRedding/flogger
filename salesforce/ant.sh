#!/bin/bash
# Deployment/Retrieve process for salesforce

task=$1
script_dir="${0%}"
match="ant.sh"

case $task in
    'deploy'|'retrieve')
        ;;
    *)
        echo "Usage transfer.sh [deploy|retrieve]"
        echo "[exiting...]"
        exit
        ;;  
esac

echo "[deploying...]"
ant ${task} -buildfile "${script_dir/$match}build.xml" -propertyfile "${script_dir/$match}salesforce.properties"
