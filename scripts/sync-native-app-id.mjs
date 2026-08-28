#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const APP_ID = 'com.kuula.app';
const legacyIdPattern = /\b(?:ug\.kuula\.app|com\.kuula\.ap)\b/g;
const files = [
  'ios/App/App.xcodeproj/project.pbxproj',
  'android/app/src/main/java/ug/kuula/app/MainActivity.java',
  'android/app/src/main/res/values/strings.xml',
];

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  content = content.replace(legacyIdPattern, APP_ID);
  writeFileSync(file, content);
  if (!content.includes(APP_ID)) {
    throw new Error(`${file} does not contain expected app identifier ${APP_ID}`);
  }
}

console.log(`Native app identifier aligned to ${APP_ID}.`);
