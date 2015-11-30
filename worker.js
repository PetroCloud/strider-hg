var path = require('path');
var fs = require('fs-extra');
var spawn = require('child_process').spawn;
var utils = require('./lib');
var Step = require('step');
var isWindows = /^win/.test(process.platform);
var PATH = isWindows ? process.env.Path : process.env.PATH;

function safespawn() {
  var process;
  try {
    process = spawn.apply(null, arguments);
  } catch (e) {
    throw new Error('Failed to start command: ' + JSON.stringify([].slice.call(arguments)))
  }
  process.on('error', function (err) {
    // suppress node errors
  });
  return process;
}

function httpCloneCmd(config, branch) {
  var urls = utils.httpUrl(config);
  var screen = 'hg clone ' + urls[1] + ' .';
  var args = ['clone', urls[0], '.'];
  if (branch) {
    args = args.concat(['--branch', branch]);
    screen += ' --branch ' + branch;
  }
  return {
    command: 'hg',
    args: args,
    screen: screen
  };
}

function httpCloneMergeCmd(config, job) {
  var urls = utils.httpUrl(config);
  var screen = 'hg clone ' + urls[1] + ' .';
  screen += ' && hg update --clean ' + job.ref.destination.branch;
  screen += ' && hg merge --quiet --tool /bin/false -r ' + job.hash;
  var args = ['clone', urls[0], '.']
  args.push('&&', 'hg', 'update', '--clean', job.ref.destination.branch);
  args.push('&&', 'hg', 'merge', '--quiet', '--tool', '/bin/false', '-r', job.ref.id);
  return {
    command: 'hg',
    args: args,
    screen: screen
  }
}

function pull(dest, config, context, branch, done) {
  utils.hgCmd('hg pull -r ' + branch, dest, context, function (exitCode) { 
    utils.hgCmd('hg update ' + branch + ' --clean' , dest, context, done)
  })
}

function hgVersion(next) {
  var child = safespawn('hg', ['--version']);
  var out = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', function (data) {
    out += data;
  });
  child.stderr.on('data', function (data) {
    out += data;
  });
  child.on('close', function (code) {
    if (code) return next(new Error('Failed to get hg version: ' + out));
    next(null, out);
  });
  child.on('error', function () {});
}

function clone(dest, config, ref, context, done) {
  if (ref.branch === 'master') {
    ref.branch = 'default';
  }
  var hg_version = parseFloat('1.0');
  hgVersion(function(err,result){
    var versionArray = result.split(' ');
    if(versionArray[0] == 'Mercurial' && versionArray[3] == '(version') {
      hg_version = parseFloat(versionArray[4].substring(0,versionArray[4].length-2));
    }
    console.info('Hg Version: ' + hg_version);
  });

  if (config.auth.type === 'ssh') {
    var cmd = 'hg clone ' + utils.sshUrl(config)[0] + ' .';
    if (ref.branch) {
      cmd += ' --branch ' + ref.branch;
    }
    return utils.mercuraneCmd(cmd, dest, config.auth.privkey, context, done);
  }
  context.cmd({
    cmd: httpCloneCmd(config, ref.branch),
    cwd: dest
  }, done);
}

function badCode(name, code) {
  var e = new Error(name + ' failed with code ' + code);
  e.code = code;
  e.exitCode = code;
  return e;
}

module.exports = {
  init: function (dirs, config, job, done) {
    return done(null, {
      config: config,
      fetch: function (context, done) {
        module.exports.fetch(dirs.data, config, job, context, done);
      }
    })
  },
  fetch: fetch
};

function getMasterPrivKey(branches) {
  for (var i=0; i<branches.length; i++) {
    if (branches[i].name === 'master') {
      return branches[i].privkey;
    }
  }
}

function checkoutRef(dest, cmd, ref, done) {
  if (ref.branch === 'master') { 
    ref.branch = 'default';
  }
  return cmd({
    cmd: 'hg checkout --quiet --clean ' + (ref.id ? '-r' : '') + utils.shellEscape(ref.id || ref.branch),
    cwd: dest
  }, function (exitCode) {
    done(exitCode && badCode('Checkout', exitCode));
  });
}

function cloneMerge(dest, config, job, context, done) {
    if (job.ref.branch === 'master') {
        job.ref.branch = 'default';
    }
    var hg_version = parseFloat('1.0');
    hgVersion(function(err,result){
        var versionArray = result.split(' ');
        if(versionArray[0] == 'Mercurial' && versionArray[3] == '(version') {
            hg_version = parseFloat(versionArray[4].substring(0,versionArray[4].length-2));
        }
        console.info('Hg Version: ' + hg_version);
    });

    if (config.auth.type === 'ssh') {
        console.info('cloning with ssh');
        var cmd = 'hg clone ' + utils.sshUrl(config)[0] + ' .';
        utils.mercuraneCmd(cmd, dest, config.auth.privkey, context, function(err, log) {
          if (err) {
            return done(err);
          }
          console.info('clone complete, switching branch');
          var hgCmd = 'hg';
          var updateArgs = ['update', '--clean', job.ref.destination.branch];
          var mergeArgs = ['merge', '--quiet', '--tool', '/bin/false', '-r', job.ref.id];
          Step(
            function() {
              var updateProc = spawn(hgCmd, updateArgs, {cwd: dest, env: {PATH:PATH}});
              updateProc.stdoutBuffer = "";
              updateProc.stderrBuffer = "";
              updateProc.stdout.setEncoding('utf8');
              updateProc.stderr.setEncoding('utf8');

              updateProc.stdout.on('data', function(buf) {
                if (typeof(context.emitter) === 'object') {
                  context.emitter.emit('stdout', buf);
                }
                updateProc.stdoutBuffer += buf;
              });

              updateProc.stderr.on('data', function(buf) {
                if (typeof(context.emitter) === 'object') {
                  context.emitter.emit('stderr', buf);
                }
                updateProc.stderrBuffer += buf;
              });

              var self = this;
              updateProc.on('close', function(exitCode) {
                var err;
                if (exitCode !== 0) {
                    err = 'error running hg update: ' + exitCode;
                    console.error(err);
                }
                self(err, updateProc.stdoutBuffer, updateProc.stderrBuffer, exitCode);
              });
              updateProc.on('error', function (err) {
              });
            },
            function(err, stdout, stderr, exitCode) {
              if (exitCode !== 0) {
                console.error('Error running hg update');
                console.error(stdout);
                console.error(stderr);
                return done(err);
              }
              console.info('done with update, merging');
              var mergeProc = spawn(hgCmd, mergeArgs, {cwd: dest, env: {PATH:PATH}});
              mergeProc.stdoutBuffer = "";
              mergeProc.stderrBuffer = "";
              mergeProc.stdout.setEncoding('utf8');
              mergeProc.stderr.setEncoding('utf8');

              mergeProc.stdout.on('data', function(buf) {
                if (typeof(context.emitter) === 'object') {
                  context.emitter.emit('stdout', buf);
                }
                mergeProc.stdoutBuffer += buf;
              });

              mergeProc.stderr.on('data', function(buf) {
                if (typeof(context.emitter) === 'object') {
                  context.emitter.emit('stderr', buf);
                }
                mergeProc.stderrBuffer += buf;
              });

              var self = this;
              mergeProc.on('close', function(exitCode) {
                if (exitCode !== 0) {
                    console.error('Error running hg merge: ' + exitCode);
                    console.error('\n\n' + mergeProc.stdoutBuffer + '\n\n' + mergeProc.stderrBuffer);
                    return done(exitCode);
                }
                return done();
              });
              mergeProc.on('error', function (err) {
              });
            }
          );
        });
    }
    else {
      context.cmd({
          cmd: httpCloneMergeCmd(config, job),
          cwd: dest
      }, done);
    }
}

function prFetch(dest, config, job, context, done) {
    if (job.ref.destination.ref.branch === 'master') {
        job.ref.destination.ref.branch = 'default';
    }
    fs.mkdirp(dest, function () {
        cloneMerge(dest, config, job, context, chkMerge);
    });
    function chkMerge(exitCode) {
        done(exitCode && badCode('Hg clone and merge', exitCode));
    }
}

function fetch(dest, config, job, context, done) {
  if (job.ref.branch === 'master') {
    job.ref.branch === 'default';
  }
  if (config.auth.type === 'ssh' && !config.auth.privkey) {
    config.auth.privkey = getMasterPrivKey(job.project.branches);
  }
  if (job.trigger.type === 'pullrequest') {
    return prFetch(dest, config, job, context, done);
  }
  var cloning = false;
  function pleaseClone() {
    cloning = true;
    fs.mkdirp(dest, function () {
      clone(dest, config, job.ref, context, updateCache);
    })
  }
  if (!config.cache) return pleaseClone();

  context.cachier.get(dest, function (err) {
    if (err) return pleaseClone();
    // make sure .hg exists
    fs.exists(path.join(dest, '.hg'), function (exists) {
      if (exists) {
        context.comment('restored code from cache');
        return pull(dest, config, context, job.ref.branch, updateCache);
      }
      fs.remove(dest, function(err) {
        pleaseClone();
      });
    });
  });

  function updateCache(exitCode) {
    if (exitCode) {
      return done(badCode('Hg ' + (cloning ? 'clone' : 'pull'), exitCode));
    }
    if (!config.cache) {
      return gotten();
    }
    context.comment('saved code to cache');
    context.cachier.update(dest, gotten);
  }

  function gotten(err) {
    if (err) {
      return done(err);
    }
    // fetch the ref
    if (job.ref.branch && !job.ref.fetch) {
      return checkoutRef(dest, context.cmd, job.ref, done);
    }
    fetchRef(job.ref.fetch, dest, config.auth, context, done);
  }
}

function fetchRef(what, dest, auth, context, done) {
  utils.hgCmd('hg pull ' + utils.shellEscape(what), dest, auth, context, function (exitCode) {
    if (exitCode) {
      return done(badCode('Fetch ' + what, exitCode));
    }
    context.cmd({
      cmd: 'hg update --quiet --clean',
      cwd: dest
    }, function (exitCode) {
      done(exitCode && badCode('Checkout', exitCode));
    });
  });
}
