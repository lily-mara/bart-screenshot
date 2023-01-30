import express from "express";
import path from "path";
import puppeteer, { ConsoleMessage } from "puppeteer";
import { execFile } from "child_process";
import fs from "fs";
import * as temp from "temp";

const PORT = process.env.PORT || 3000;

const browser = await puppeteer.launch();

let page = null;
await initPage();

express()
  .get("/health", async (req, res) => {
    console.log("GET /health");
    res.send("ok");
  })
  .get("/", async (req, res) => {
    console.log("GET /");

    try {
      await page.waitForSelector(".real-time-departures");
    } catch (TimeoutError) {
      console.log("timeout waiting for element");
      console.log("response 500");

      res.writeHead(500);
      res.end("timeout waiting for element");
      return;
    }
    const element = await page.$(".real-time-departures");

    await page.screenshot({ path: "page.png" });

    const path = await tempfile(".png");

    await element.screenshot({ path });

    const final = await convert(path);

    deleteFile(path);

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": final.length,
    });
    console.log("response 200");
    return res.end(final);
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

// This loop purges and re-opens the page every hour because it seems that the
// program has a memory leak.
while (true) {
  // wait one hour
  await timeout(1000 * 60 * 60);
  await initPage();
}

async function initPage() {
  const newPage = await browser.newPage();
  await newPage.setViewport({ width: 1200, height: 1200 });
  let response = await load(
    newPage,
    `https://www.bart.gov/schedules/eta?stn=CIVC`
  );

  let delay = 10;
  let attempts = 5;
  while (response.status() != 200) {
    if (attempts <= 0) {
      throw new Error("Failed to load bart website!");
    }
    attempts--;

    console.log(`sleep ${delay}s`);
    await timeout(delay * 1000);

    delay *= 2;

    response = await load(
      newPage,
      `https://www.bart.gov/schedules/eta?stn=CIVC`
    );
  }

  if (page) {
    console.log("closing existing page");
    page.close();
  }

  page = newPage;
}

async function load(page, url) {
  console.log(`load: ${url}`);
  const response = await page.goto(url);

  console.log(`load: ${url} ${response.status()}`);

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

function deleteFile(path) {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
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

  const finalContents = await readFile(finalPath);

  // Not awaiting these promises because we don't need to block the HTTP request
  // on the disk IO here
  deleteFile(rotatedPath);
  deleteFile(paddedPath);
  deleteFile(colorsafePath);
  deleteFile(finalPath);

  return finalContents;
}

(async () => {})();
