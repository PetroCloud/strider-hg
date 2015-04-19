
var exec   = require('child_process').exec
  , path = require('path')
  , fs     = require('fs')
  , shellescape = require('shell-escape')
  , _ = require('underscore')

module.exports = {
  getBranches: getBranches,
  getUrl: getUrl,
  sshUrl: sshUrl,
  httpUrl: httpUrl,
  hgCmd: hgCmd,
  shellEscape: shellEscape
}

function shellEscape(one) {
  if (!one) {
    throw new Error('trying to escape nothing', one)
  }
  return shellescape([one])
}

// returns [real, safe] urls
function getUrl(config) {
  return (config.auth.type === 'ssh' ? sshUrl : httpUrl)(config)
}

function sshUrl(config) {
  var base = config.url
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1]
  }
  if (base.indexOf('@') === -1) {
    base = 'hg@' + base
  }
  base = 'ssh://' + base;
  var url = shellEscape(base)
  return [url, url]
}

function httpUrl(config) {
  var base = config.url
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1]
  }
  var url = config.auth.type + '://' + config.auth.username + ':' + config.auth.password + '@' + base
    , safe = config.auth.type + '://[username]:[password]@' + base
  return [url, safe]
}

function hgCmd(cmd, cwd, done) {
  context.cmd({
    cmd: cmd,
    cwd: cwd
  }, done)
}

function getBranches_command(config) {
  var repoLocation = config.url;
  var pythonScript = fs.realpathSync(path.join(__dirname, 'hg_api_remotebranches.py'));
  var cmd = 'python ' + pythonScript + " " + repoLocation;
}

function getBranches_process(stdout) {
  return _.filter(stdout.split("\n"),function(v){return !!v})
}

function getBranches(config, privkey, done) {
  exec(getBranches_command(config), function (err, stdout, stderr) {
    if (err) {
      return done(err);
    } else {
      return done(getBranches_process(stdout));
    }
  })
}
