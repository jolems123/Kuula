#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const APP_ID = 'com.kuula.app';
const legacyIds = ['ug.kuula.app', 'com.kuula.ap'];
const files = [
  'ios/App/App.xcodeproj/project.pbxproj',
];

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  for (const legacyId of legacyIds) {
    content = content.replaceAll(legacyId, APP_ID);
  }
  writeFileSync(file, content);
  if (!content.includes(APP_ID)) {
    throw new Error(`${file} does not contain expected app identifier ${APP_ID}`);
  }
}

console.log(`Native app identifier aligned to ${APP_ID}.`);
