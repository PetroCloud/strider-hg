
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
  shellEscape: shellEscape,
  sshkey_delete: sshkey_delete,
  sshkey_extract: sshkey_extract,
  sshkey_install: sshkey_install
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

function hgCmd(cmd, cwd, context, done) {
  context.cmd({
    cmd: cmd,
    cwd: cwd
  }, done)
}

function getBranches_command(config) {
  var pythonScript = fs.realpathSync(path.join(__dirname, 'hg_api_remotebranches.py'));
  return 'python ' + pythonScript + " " + getUrl(config)[0];
}

function getBranches_process(stdout,done) {
  done(null, _.filter(stdout.split("\n"),function(v){return !!v}))
}

function getBranches(config, privkey, done) {
  if(config.auth.type === 'ssh')
    sshkey_install(privkey);
  exec(getBranches_command(config), function (err, stdout, code) {
    if(config.auth.type === 'ssh')
      sshkey_delete(privkey);
    if (err) {
      return done(err);
    } else {
      getBranches_process(stdout,done);
    }
  })
}

function sshkey_delete(){
  var keypath = process.env['HOME']+'/.ssh/id_strider_privkey';
  exec('ssh-add -D', function(err, out, code) {
    if (err instanceof Error)
      console.log(err);
   })
  fs.exists(keypath, function (exists) {
    if(exists) 
      fs.unlinkSync(keypath); 
  });
}

function sshkey_extract(branches) {
  for (var i=0; i<branches.length; i++) {
    if (branches[i].name === 'master') {
      return branches[i].privkey
    }
  }
}

function sshkey_install(privkey){
  var keypath = process.env['HOME']+'/.ssh/id_strider_privkey';
  fs.exists(keypath, function (exists) {
    if(exists) 
      fs.unlinkSync(keypath); 
  })

  fs.writeFileSync(keypath, privkey);
  fs.chmodSync(keypath, '600');
  exec('ssh-add -k ' + keypath, function(err, out, code) {
    if (err instanceof Error)
      console.log(err);
  })
}

