// Import necessary modules
import os from 'os';
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { createRequire } from 'module';
import fs, { promises as fsPromises } from 'fs';
import chalk from 'chalk';
import cfonts from 'cfonts';

const { say } = cfonts;

// Function to send HTML files
const sendHtml = (res, next, fileName) => {
  res.sendFile(path.join(htmlDir, fileName + '.html'));
};

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;
const basePath = new URL(import.meta.url).pathname;
const htmlDir = path.join(path.dirname(basePath), 'Assets');

// Define routes
app.get('/', (req, res) => sendHtml(res, next, 'someFile'));
app.listen(port, () => console.log(chalk.yellow('Server is open on port ' + port)));

let isRunning = false;

// Function to start a child process
async function start(fileName) {
  if (isRunning) return;
  isRunning = true;

  const baseURL = new URL(import.meta.url).pathname;
  const filePath = path.join(path.dirname(baseURL), fileName);
  const args = [filePath, ...process.argv.slice(2)];

  const childProcess = spawn(process.argv[0], args, { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });

  childProcess.on('message', (msg) => {
    console.log(chalk.cyan('✔️RECEIVED ' + msg));
  });

  childProcess.on('exit', (code) => {
    isRunning = false;
    console.log(chalk.green('Exited with code: ' + code));
    if (code === 0) return;

    fsPromises.readFile(filePath, 'utf8')
      .then((data) => {
        console.log(chalk.magenta(data));
        start(fileName);
      })
      .catch((err) => console.error(chalk.red('Error reading file: ' + err)));
  });

  const pluginDir = path.join(path.dirname(baseURL), 'Plugins');
  fs.readdir(pluginDir, async (err, files) => {
    if (err) {
      console.error(chalk.red('Error reading plugins folder: ' + err));
      return;
    }

    console.log(chalk.green('Installed ' + files.length + ' plugins.'));
  });
}

// Start the 'Guru.js' process
start('Guru.js');

// Event handlers for unhandled rejections and uncaught exceptions
process.on('unhandledRejection', () => {
  console.error(chalk.red('Unhandled promise rejection. Bot will restart...'));
  start('Guru.js');
});

process.on('uncaughtException', (err) => {
  console.error(chalk.red('Error: ' + err));
  console.error(chalk.red('Bot will restart...'));
  start('Guru.js');
});
