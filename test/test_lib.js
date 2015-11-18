'use strict';

var expect = require('expect.js');
var lib = require('../lib');

describe('lib functions', function () {
  describe('.sshUrl', function () {
    it('should preserve a full scp ssh url', function () {
      var url = 'hg@bitbucket.com:test/repo';
      expect(lib.sshUrl({url: url})[0]).to.equal(url);
    });

    it('should sshify a git url', function () {
      var url = 'hg://one.com/two';
      var ssh = 'hg@one.com:two';
      expect(lib.sshUrl({url: url})[0]).to.equal(ssh);
    });

    it('should preserve an ssh:// url', function () {
      var url = 'ssh://user@host.com:20/one/two';
      expect(lib.sshUrl({url: url})[0]).to.equal(url);
    });

    it('should preserve an ssh:// url with no port', function () {
      var url = 'ssh://user@host.com/one/two';
      expect(lib.sshUrl({url: url})[0]).to.equal(url);
    });
  });
});

