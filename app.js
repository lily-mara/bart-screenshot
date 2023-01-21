import express from "express";
import path from "path";
import puppeteer from "puppeteer";
import { execFile } from "child_process";
import fs from "fs";
import * as temp from "temp";

const PORT = process.env.PORT || 3000;

const browser = await puppeteer.launch();

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1200 });
let response = await load(page, `https://www.bart.gov/schedules/eta?stn=CIVC`);

if (response.status() != 200) {
  throw new Error("Failed to initialize!");
}

express()
  .get("/", async (req, res) => {
    console.log("GET /");

    await page.waitForSelector(".real-time-departures");
    const element = await page.$(".real-time-departures");

    await page.screenshot({ path: "page.png" });

    const path = await tempfile(".png");

    await element.screenshot({ path });

    const final = await convert(path);

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": final.length,
    });
    console.log("response 200");
    return res.end(final);
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

async function load(page, url) {
  console.log(`load: ${url}`);
  const response = await page.goto(url);

  const pageFile = await tempfile(".png");
  page.screenshot({ path: pageFile });
  console.log(`load: ${url} ${response.status()} ${pageFile}`);

  return response;
}

function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function timeout(ms) {
  return new Promise((resolve, _reject) => {
    setTimeout(() => resolve(), ms);
  });
}

function tempfile(suffix) {
  return new Promise((resolve, reject) => {
    temp.open({ suffix }, (err, file) => {
      if (err) {
        reject(err);
      } else {
        resolve(file.path);
      }
    });
  });
}

function exec(program, args) {
  return new Promise((resolve, reject) => {
    execFile(program, args, (err, _stdout, _stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function convert(path) {
  const rotatedPath = await tempfile(".png");
  const paddedPath = await tempfile(".png");
  const colorsafePath = await tempfile(".png");
  const finalPath = await tempfile(".png");

  await exec("convert", [path, "-rotate", "90", rotatedPath]);
  await exec("./aspect", [
    "758x1024",
    "-g",
    "East",
    "-c",
    "#f1f5e3",
    rotatedPath,
    paddedPath,
  ]);
  await exec("convert", [
    paddedPath,
    "-gravity",
    "NorthEast",
    "-colorspace",
    "gray",
    "-depth",
    "8",
    colorsafePath,
  ]);
  await exec("convert", [colorsafePath, "-scale", "758x1024", finalPath]);

  console.log({ path, paddedPath, rotatedPath, colorsafePath, finalPath });

  return await readFile(finalPath);
}

(async () => {})();
