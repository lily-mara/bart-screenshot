#!/bin/bash

node app.js
convert bart.png -rotate 90 bart-rotated.png
convert bart-rotated.png -gravity NorthEast -crop 758:1024 -colorspace gray -depth 8 bart-colorsafe.png
convert bart-colorsafe.png -scale 758x1024 bart-final.png
