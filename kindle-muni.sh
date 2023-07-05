#!/bin/sh

set -e

rm -f muni.png
eips -c
eips -c
curl http://192.168.50.45:3241/muni -o muni.png --fail-with-body
eips -g muni.png
