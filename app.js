import express from "express";
import path from "path";
import puppeteer, { ConsoleMessage } from "puppeteer";
import { execFile } from "child_process";
import fs from "fs";
import * as temp from "temp";

const PORT = process.env.PORT || 3000;
const URL = "https://www.bart.gov/schedules/eta?stn=CIVC";

const MUNI_URLS = {
  east: [
    "https://www.sfmta.com/stops/civic-center-station-15727",
    "https://www.sfmta.com/stops/market-st-7th-st-15650",
    "https://www.sfmta.com/stops/market-st-7th-st-15649",
    "https://www.sfmta.com/stops/mcallister-st-leavenworth-st-17635",
  ],
  west: [
    "https://www.sfmta.com/stops/civic-center-station-16997",
    "https://www.sfmta.com/stops/market-st-7th-st-15656",
    "https://www.sfmta.com/stops/mcallister-st-jones-st-17563",
  ],
};

let muniPages = {
  east: {},
  west: {},
};

const browser = await puppeteer.launch();

let bartPage = null;

await Promise.all([initBartPage(), initMuniPages()]);

express()
  .get("/health", async (req, res) => {
    console.log("GET /health");
    res.send("ok");
  })
  .get("/muni", async (req, res) => {
    console.log("GET /muni");

    const [eastImages, westImages] = await Promise.all([
      Promise.all(
        MUNI_URLS.east.map((url) =>
          screenshotSingleMuniPage(url, muniPages.east[url])
        )
      ),
      Promise.all(
        MUNI_URLS.west.map((url) =>
          screenshotSingleMuniPage(url, muniPages.west[url])
        )
      ),
    ]);

    const final = await convertMuniImages(eastImages, westImages);

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": final.length,
    });
    console.log("response 200");
    return res.end(final);
  })
  .get("/", async (req, res) => {
    console.log("GET /");

    try {
      await bartPage.waitForSelector(".real-time-departures");
    } catch (TimeoutError) {
      console.log("timeout waiting for element");
      console.log("response 500");

      res.writeHead(500);
      res.end("timeout waiting for element");
      return;
    }
    const element = await bartPage.$(".real-time-departures");

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
  await initBartPage();
  await initMuniPages();
}

async function screenshotSingleMuniPage(url, page) {
  await page.waitForSelector("section#next-bus.loaded");

  const element = await page.$("section#next-bus.loaded");

  await element.evaluate((el) => {
    el.style.gap = "10px";
    el.style.paddingBottom = "5px";
    el.style.paddingTop = "5px";
    el.style.borderBottom = "1px black solid";

    const children = el.children;
    const sortedChildren = [].slice.call(children).sort(function (a, b) {
      return a.querySelector(".route-logo").innerText >
        b.querySelector(".route-logo").innerText
        ? 1
        : -1;
    });

    sortedChildren.forEach(function (p) {
      el.appendChild(p);
    });
  });

  const path = url.replace("https://www.sfmta.com/stops/", "") + ".png";

  await element.screenshot({ path });

  return path;
}

async function initBartPage() {
  const newPage = await browser.newPage();
  await newPage.setViewport({ width: 1200, height: 1200 });
  await newPage.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
  );
  let response = await load(newPage, URL);

  let delay = 10;
  let attempts = 20;
  while (response.status() != 200) {
    if (attempts <= 0) {
      throw new Error("Failed to load bart website!");
    }

    console.log(`sleep ${delay}s`);
    await timeout(delay * 1000);

    delay *= 2;

    response = await load(newPage, URL);
  }

  if (bartPage) {
    console.log("closing existing page");
    bartPage.close();
  }

  bartPage = newPage;
}

async function initMuniPages() {
  await Promise.all([
    Promise.all(MUNI_URLS.east.map((url) => initSingleMuniPage(url, "east"))),
    Promise.all(MUNI_URLS.west.map((url) => initSingleMuniPage(url, "west"))),
  ]);
}

async function initSingleMuniPage(url, direction) {
  const newPage = await browser.newPage();
  await newPage.setViewport({ width: 400, height: 1200 });
  await newPage.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
  );
  let response = await load(newPage, url);

  let oldPage = muniPages[direction][url];

  if (oldPage) {
    console.log("closing existing page");
    oldPage.close();
  }

  muniPages[direction][url] = newPage;
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

async function deleteAllFiles(paths) {
  await Promise.all(paths.map(deleteFile));
}

async function convertMuniImages(eastImages, westImages) {
  const [eastPath, westPath, tiledPath, paddedPath, finalPath] =
    await Promise.all([
      tempfile(".png"),
      tempfile(".png"),
      tempfile(".png"),
      tempfile(".png"),
      tempfile(".png"),
    ]);

  const args = (images, out) => ["-append", ...images, out];

  const eastArgs = args(eastImages, eastPath);
  const westArgs = args(westImages, westPath);

  await Promise.all([exec("convert", eastArgs), exec("convert", westArgs)]);

  await exec("montage", [
    "-geometry",
    "+10+10",
    "-gravity",
    "North",
    westPath,
    eastPath,
    tiledPath,
  ]);

  await exec("./aspect", ["800x600", "-c", "white", tiledPath, paddedPath]);

  await exec("convert", [
    paddedPath,
    "-rotate",
    "90",
    "-colorspace",
    "gray",
    "-depth",
    "8",
    finalPath,
  ]);

  const final = await readFile(finalPath);

  deleteAllFiles([
    eastPath,
    westPath,
    tiledPath,
    paddedPath,
    finalPath,
    ...eastImages,
    ...westImages,
  ]);

  return final;
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
