#!/usr/bin/env bash

# systemd Service Installer Script

# Note: This script needs to be run in its folder (for $PWD to produce the correct path)

service="tokens-api"

service_file="[Unit]
Description=Tokens for Climate Care – Web API
Documentation=https://github.com/studioprocess/tokens-api-node
After=network.target
Conflicts=

[Service]
Environment=
Type=simple
User=$USER
ExecStart=$PWD/main.mjs
WorkingDirectory=$PWD
Restart=always

[Install]
WantedBy=multi-user.target
"

usage() {
  echo "Usage:"
  echo "  Install/Uninstall:  $0 install|remove|uninstall"
  echo "  Enable/Disable:     $0 enable|disable"
  echo "  Start/Stop/Restart: $0 start|stop|restart"
  echo "  Status:             $0 status"
  echo "  Logs:               $0 logs"
  exit
}

if [ $# -eq 0 ]; then
  usage
fi

if [ $1 == "install" ] ; then
  echo "[ Installing Service File ]"
  sudo echo "$service_file" > /etc/systemd/system/${service}.service
  echo "[ Enabling Service ]"
  sudo systemctl enable $service
elif [ $1 == "remove" ] || [ $1 == "uninstall" ]; then
  echo "[ Disabling Service ]"
  sudo systemctl disable $service
  echo "[ Removing Service File ]"
  sudo rm -f /etc/systemd/system/${service}.service
elif [ $1 == "enable" ] ; then
  echo "[ Enabling Service ]"
  sudo systemctl enable $service
elif [ $1 == "disable" ] ; then
  echo "[ Disabling Service ]"
  sudo systemctl disable $service
elif [ $1 == "start" ] ; then
  echo "[ Starting Service ]"
  sudo systemctl start $service
elif [ $1 == "stop" ] ; then
  echo "[ Stopping Service ]"
  sudo systemctl stop $service
elif [ $1 == "restart" ] ; then
  echo "[ Restarting Service ]"
  sudo systemctl restart $service
elif [ $1 == "status" ] ; then
  echo "[ Service Service ]"
  sudo systemctl status $service
elif [ $1 == "logs" ] ; then
  echo "[ Service Logs ]"
  sudo journalctl -u ${service}.service
else
  usage
fi
