module.exports = function (grunt) {
  'use strict';

  var missing = 'MISSING: this key is undefined';
  var jsdom = require('jsdom');

  function startExtraction(document) {
    var name = undefined, comment = undefined;
    var aliases = document.getElementsByTagName('sc-alias');
    if (aliases.length > 0) {
      name = aliases[0].getAttribute('name');
      if (aliases[0].hasAttribute('sc-comment'))
        comment = aliases[0].getAttribute('sc-comment');
    }

    return {
      alias: name,
      comment: comment,
      tokens: extract(document, document, {})
    };
  }

  function extract(document, node, obj) {
    Array.prototype.slice.call(node.getElementsByTagName('*')).forEach(function (elm) {
      if (elm.tagName === 'SCRIPT' && elm.hasAttribute('type') && elm.getAttribute('type') === 'text/ng-template') {
        var div = document.createElement('div');
        div.innerHTML = elm.innerHTML;
        extract(document, div, obj);
      } else if (elm.hasAttribute('translate')) {
        var text = elm.innerHTML.match(/\S+/g) !== null
                 ? elm.innerHTML.replace(/\s+/g, ' ').trim() // normalize all whitespace
                 : missing;

        var key = elm.getAttribute('translate');
        if (key.indexOf('{{') === -1) { // interpolated translate attributes aren't real translation keys
          if (typeof obj[key] === 'undefined' || obj[key].text === missing) {
            obj[key] = {
              text: text
            };

            if (elm.hasAttribute('sc-comment'))
              obj[key].comment = elm.getAttribute('sc-comment');
          } else if (text !== missing && text !== obj[key].text) {
            obj[key] = {
              text: 'CONFLICT: this key is defined multiple times'
            };
          }
        }
      }
    });

    return obj;
  }

  // 1. Flattens comments out of the json, e.g. '{ "key": { "text": "asdf", comment: "fdsa" } }' becomes '{ "key": "asdf" }'
  // 2. Renames root keys to the specified alias, if present, e.g. '{ "file.html": { "alias": "asdf", ... } }' becomes '{ "asdf": ... }'
  // Output is usable by angular-translate
  function convert(json) {
    var res = {};
    Object.keys(json).forEach(function (filepath) {
      var file = json[filepath];
      var alias = file.alias || filepath;
      Object.keys(file.tokens).forEach(function (key) {
        res[alias + '.' + key] = file.tokens[key].text;
      });
    });
    return res;
  } 
   grunt.registerMultiTask('convert-tokens', function () {
    this.files.forEach(function (f) {
        f.src.forEach(function (s) {
            grunt.file.write(f.dest,JSON.stringify(convert(grunt.file.readJSON(s)), null, 2));
        });
    });
  });

  grunt.registerMultiTask('extract-tokens', function () {
    var done = this.async();
    var taskCountDown = this.files.reduce(function (sum, f) { return sum + f.src.length; }, 0);

    this.files.forEach(function (f) {
      var fileCountDown = f.src.length;
      var json = {};
      f.src.forEach(function (s) {
        // parse template:
        jsdom.env(grunt.file.read(s), [], function (err, window) {
          fileCountDown--;
          taskCountDown--;

          if (err) {
            grunt.log.error('PARSE ERROR: "' + s + '" excluded from tokenization in "' + f.dest + '"');
            grunt.log.error(err);
            return;
          }

          // extract keys / text / comments and merge into json:
          var data = startExtraction(window.document);
          if (Object.keys(data.tokens).length > 0) {
            json[s] = data;
          }

          if (fileCountDown <= 0) {
            grunt.file.write(f.dest, JSON.stringify(json, null, 2));
          }

          if (taskCountDown <= 0) {
            done();
          }
        });
      });
    });
  });
};