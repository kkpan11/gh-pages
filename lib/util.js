const path = require('path');
const async = require('async');
const fs = require('fs-extra');
const Git = require('./git.js');

/**
 * Generate a list of unique directory paths given a list of file paths.
 * @param {Array<string>} files List of file paths.
 * @return {Array<string>} List of directory paths.
 */
function uniqueDirs(files) {
  const dirs = new Set();
  files.forEach((filepath) => {
    const parts = path.dirname(filepath).split(path.sep);
    let partial = parts[0] || '/';
    dirs.add(partial);
    for (let i = 1, ii = parts.length; i < ii; ++i) {
      partial = path.join(partial, parts[i]);
      dirs.add(partial);
    }
  });
  return Array.from(dirs);
}

/**
 * Sort function for paths.  Sorter paths come first.  Paths of equal length are
 * sorted alphanumerically in path segment order.
 * @param {string} a First path.
 * @param {string} b Second path.
 * @return {number} Comparison.
 */
function byShortPath(a, b) {
  const aParts = a.split(path.sep);
  const bParts = b.split(path.sep);
  const aLength = aParts.length;
  const bLength = bParts.length;
  let cmp = 0;
  if (aLength < bLength) {
    cmp = -1;
  } else if (aLength > bLength) {
    cmp = 1;
  } else {
    let aPart, bPart;
    for (let i = 0; i < aLength; ++i) {
      aPart = aParts[i];
      bPart = bParts[i];
      if (aPart < bPart) {
        cmp = -1;
        break;
      } else if (aPart > bPart) {
        cmp = 1;
        break;
      }
    }
  }
  return cmp;
}
exports.byShortPath = byShortPath;

/**
 * Generate a list of directories to create given a list of file paths.
 * @param {Array<string>} files List of file paths.
 * @return {Array<string>} List of directory paths ordered by path length.
 */
function dirsToCreate(files) {
  return uniqueDirs(files).sort(byShortPath);
}
exports.copy = function (files, base, dest) {
  return new Promise((resolve, reject) => {
    const pairs = [];
    const destFiles = [];
    files.forEach((file) => {
      const src = path.resolve(base, file);
      const relative = path.relative(base, src);
      const target = path.join(dest, relative);
      pairs.push({
        src: src,
        dest: target,
      });
      destFiles.push(target);
    });

    async.eachSeries(dirsToCreate(destFiles), makeDir, (err) => {
      if (err) {
        return reject(err);
      }
      async.each(pairs, copyFile, (err) => {
        if (err) {
          return reject(err);
        } else {
          return resolve();
        }
      });
    });
  });
};

exports.copyFile = copyFile;

exports.dirsToCreate = dirsToCreate;

/**
 * Copy a file.
 * @param {Object} obj Object with src and dest properties.
 * @param {function(Error):void} callback Callback
 */
function copyFile(obj, callback) {
  let called = false;
  function done(err) {
    if (!called) {
      called = true;
      callback(err);
    }
  }

  const read = fs.createReadStream(obj.src);
  read.on('error', (err) => {
    done(err);
  });

  const write = fs.createWriteStream(obj.dest);
  write.on('error', (err) => {
    done(err);
  });
  write.on('close', () => {
    done();
  });

  read.pipe(write);
}

/**
 * Make directory, ignoring errors if directory already exists.
 * @param {string} path Directory path.
 * @param {function(Error):void} callback Callback.
 */
function makeDir(path, callback) {
  fs.mkdir(path, (err) => {
    if (err) {
      // check if directory exists
      fs.stat(path, (err2, stat) => {
        if (err2 || !stat.isDirectory()) {
          callback(err);
        } else {
          callback();
        }
      });
    } else {
      callback();
    }
  });
}

/**
 * Copy a list of files.
 * @param {Array<string>} files Files to copy.
 * @param {string} base Base directory.
 * @param {string} dest Destination directory.
 * @return {Promise} A promise.
 */

exports.getUser = function (cwd) {
  return Promise.all([
    new Git(cwd).exec('config', 'user.name'),
    new Git(cwd).exec('config', 'user.email'),
  ])
    .then((results) => {
      return {name: results[0].output.trim(), email: results[1].output.trim()};
    })
    .catch((err) => {
      // git config exits with 1 if name or email is not set
      return null;
    });
};

exports.uniqueDirs = uniqueDirs;
