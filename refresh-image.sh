#!/bin/sh

status=$(curl "$1" -o next-image.png -w "%{http_code}")
eips -c
eips -c

if [ "$status" = '200' ]; then
    mv next-image.png image.png
    date > updated-time

    eips -g image.png
else
    eips "Last updated $(cat updated-time)"
fi
