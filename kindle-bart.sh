#!/bin/sh

set -e

rm -f bart.png
eips -c
eips -c
curl http://192.168.50.45:3241 -o bart.png --fail-with-body
#curl http://146.190.62.149:3000 -o bart.png --fail-with-body
eips -g bart.png
