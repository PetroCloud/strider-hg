'use strict';

var mercurane = require('mercurane');
var exec = require('child_process').exec;
var shellescape = require('shell-escape');

module.exports = {
  getBranches: getBranches,
  getUrl: getUrl,
  sshUrl: sshUrl,
  httpUrl: httpUrl,
  hgCmd: hgCmd,
  mercuraneCmd: mercuraneCmd,
  processBranches: processBranches,
  getBranches: getBranches,
  shellEscape: shellEscape
};

function shellEscape(one) {
  if (!one) {
    throw new Error('trying to escape nothing', one);
  }
  
  return shellescape([one]);
}

// returns [real, safe] urls
function hgUrl(config) {
  return (config.auth.type === 'ssh' ? sshUrl : httpUrl)(config);
}

function sshUrl(config) {
  var base = config.url;
  
  if (base.indexOf('ssh://') === 0) {
    return [base, base];
  }
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1];
  }
  if (base.indexOf('@') === -1) {
    base = 'hg@' + base
  }
  if (base.indexOf(':') === -1) {
    base = base.replace('/', ':');
  }
  
  var url = shellEscape(base);
  return [url, url];
}

function httpUrl(config) {
  var base = config.url;
  
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1];
  }
  
  var url = config.auth.type + '://' + config.auth.username + ':' + config.auth.password + '@' + base;
  var safe = config.auth.type + '://[username]:[password]@' + base;
  
  return [url, safe];
}

function hgCmd(cmd, cwd, auth, context, done) {
  if (auth.type === 'ssh') {
    return mercuraneCmd(cmd, cwd, auth.privkey, context, done);
  }
  
  context.cmd({
    cmd: cmd,
    cwd: cwd
  }, done);
}

// run a strider command with gitane
function mercuraneCmd(cmd, dest, privkey, context, done) {
  var start = new Date();
  
  context.status('command.start', { command: cmd, time: start, plugin: context.plugin });
  
  mercurane.run({
    emitter: {
      emit: context.status
    },
    cmd: cmd,
    spawn: context.runCmd,
    baseDir: dest,
    privKey: privkey,
    detached: true
  }, function (err, stdout, stderr, exitCode) {
    var end = new Date();
    var elapsed = end.getTime() - start.getTime();
    
    if (err) {
      return done(err);
    } else {
      getBranches_process(stdout,done);
    }
    context.log('mercurane command done ' + cmd + '; exit code ' + exitCode + '; duration ' + elapsed);
    context.status('command.done', {
      exitCode: exitCode,
      time: end,
      elapsed: elapsed
    });
    
    done(err ? 500 : exitCode, stdout + stderr);
  });
}

function processBranches(data, done) {
  done(null, data.trim().split(/\n+/).map(function (line) {
    return line.split(/\s+/)[1].split('/').slice(-1)[0];
  }));
}

function getBranches(config, privkey, done) {
  if (config.auth.type === 'ssh') {
    mercurane.run({
      cmd: 'hg identify ' + hgUrl(config)[0],
      baseDir: '/',
      privKey: config.auth.privkey || privkey,
      detached: true
    }, function (err, stdout, stderr, exitCode) {
      if (err || exitCode !== 0) {
        return done(err || new Error(stderr));
      }
      
      processBranches(stdout, done);
    });
  } else {
    exec('hg identify ' + httpUrl(config)[0], function (err, stdout, stderr) {
      if (err) return done(err);
      processBranches(stdout, done);
    });
  }
}
