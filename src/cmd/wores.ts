#!/usr/bin/env node

import { parse, TYPE } from "intl-messageformat-parser";
import { resolve, extname } from "path";
import { exit, argv } from "process";
import { readdir, writeFile, statSync } from "fs";

import {
  createInterface,
  createMessageTokenUnion,
  createDictyonaryKeysUnion,
  createTranslateFunction,
  wrapup,
} from "./declaration";
import { compareMessageResourceContainers } from "./compare";
import {
  FlatStringObject,
  MessageResource,
  MessageResourceContainer,
  isFlatStringObject,
  printError,
} from "./util";

if (argv.length !== 4) {
  // TODO: Print usage.
  printError("Resource directory and output file must be specified.");
  exit(1);
}

const resourceDir = argv[2];
const outputPath = argv[3];
readdir(resourceDir, { encoding: "utf8" }, async (err, files) => {
  if (err) {
    printError(err);
    exit(1);
  }

  const jsonFiles = files
    .map(file => resolve(resourceDir, file))
    .filter(absPath => {
      return statSync(absPath).isFile && extname(absPath) === ".json";
    })

  const promises = jsonFiles.map(async (absPath) => {
    const { default: jsonObj } = await import(absPath);

    if (!isFlatStringObject(jsonObj)) {
      throw new TypeError(`"${absPath}" must be flat and string-valued JSON.`);
    }

    const ret: MessageResourceContainer = {
      filename: absPath,
      messageResource: analyzeFlatStringObject(jsonObj),
    };
    return ret;
  });

  const messageResourceContainers = await Promise.all(promises).catch(err => {
    if (typeof(err) === "string" || err instanceof Error) {
      printError(err);
    }
    exit(1);
  });

  if (messageResourceContainers) {
    try {
      compareMessageResourceContainers(messageResourceContainers);
    } catch (e) {
      printError(e);
      exit(1);
    }

    const messageResource = messageResourceContainers[0].messageResource;
    const interfaceNames = Object.keys(messageResource);
    const interfaces = interfaceNames.map(interfaceName => createInterface(interfaceName, messageResource[interfaceName]));

    const messageTokenUnion = createMessageTokenUnion(interfaceNames);
    const dictionaryKeysUnion = createDictyonaryKeysUnion(interfaceNames);
    const translateFunction = createTranslateFunction();

    const declaration = wrapup(interfaces, messageTokenUnion, dictionaryKeysUnion, translateFunction);

    // TODO: check file existance.
    writeFile(outputPath, declaration, { encoding: "utf8" }, (err) => {
      if (err) {
        printError(err);
        exit(1);
      }
    });
  }
});

// TODO: separate to another file and write unit test.
const analyzeFlatStringObject = (jsonObj: FlatStringObject) => {
  const interfaceNames = Object.keys(jsonObj);
  // TODO: Validate interfaceNames.

  const ret: MessageResource = {};

  interfaceNames.forEach(interfaceName => {
    const ast = parse(jsonObj[interfaceName]);
    const vars = ast
      .filter(node => node.type !== TYPE.literal)
      .map(node => node.value);

    ret[interfaceName] = new Set(vars);
  });

  return ret;
};

