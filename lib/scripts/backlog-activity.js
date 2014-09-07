// Description
//   A Hubot script that relay the backlog activities to your chat room.
//
// Dependencies:
//   "request": "^2.40.0"
//
// Configuration:
//   HUBOT_BACKLOG_ACTIVITY_SPACE_ID
//   HUBOT_BACKLOG_ACTIVITY_API_KEY
//   HUBOT_BACKLOG_ACTIVITY_MAPPINGS
//   HUBOT_BACKLOG_ACTIVITY_USER_MAPPINGS
//   HUBOT_BACKLOG_ACTIVITY_INTERVAL
//   HUBOT_BACKLOG_ACTIVITY_USE_SLACK
//
// Author:
//   bouzuya <m@bouzuya.net>
//
var request;

request = require('request');

module.exports = function(robot) {
  var API_KEY, INTERVAL, MAPPINGS, SPACE_ID, USER_MAPPINGS, USE_SLACK, fetchActivity, fetchAndSendActivity, fetchResolutions, fetchStatuses, formatActivity, getMention, getResolution, getStatus, minId, resolutions, rpad, sendActivity, statuses, _ref, _ref1, _ref2;
  SPACE_ID = process.env.HUBOT_BACKLOG_ACTIVITY_SPACE_ID;
  API_KEY = process.env.HUBOT_BACKLOG_ACTIVITY_API_KEY;
  MAPPINGS = (_ref = process.env.HUBOT_BACKLOG_ACTIVITY_MAPPINGS) != null ? _ref : '{}';
  USER_MAPPINGS = (_ref1 = process.env.HUBOT_BACKLOG_ACTIVITY_USER_MAPPINGS) != null ? _ref1 : '{}';
  INTERVAL = (_ref2 = process.env.HUBOT_BACKLOG_ACTIVITY_INTERVAL) != null ? _ref2 : 30000;
  USE_SLACK = process.env.HUBOT_BACKLOG_ACTIVITY_USE_SLACK != null;
  statuses = [];
  resolutions = [];
  minId = null;
  rpad = function(s, l) {
    while (s.length < l) {
      s += '  ';
    }
    return s;
  };
  getStatus = function(value) {
    var status, _ref3;
    status = statuses.filter(function(i) {
      return i.id === parseInt(value, 10);
    })[0];
    return (_ref3 = status != null ? status.name : void 0) != null ? _ref3 : value;
  };
  getResolution = function(value) {
    var resolution, _ref3;
    resolution = resolutions.filter(function(r) {
      return r.id === parseInt(value, 10);
    })[0];
    return (_ref3 = resolution != null ? resolution.name : void 0) != null ? _ref3 : value;
  };
  formatActivity = function(activity) {
    var a, c, changes, issueKey, maxWidth, url, userName, _ref3;
    a = activity;
    c = a.content;
    userName = a.createdUser.name;
    issueKey = "" + a.project.projectKey + "-" + a.content.key_id;
    url = "https://" + SPACE_ID + ".backlog.jp/view/" + issueKey;
    if (c.comment != null) {
      maxWidth = 0;
      changes = c.changes.map(function(change) {
        switch (false) {
          case change.field !== 'status':
            change.field = '状態';
            change.old_value = getStatus(change.old_value);
            change.new_value = getStatus(change.new_value);
            break;
          case change.field !== 'assigner':
            change.field = '担当者';
            break;
          case change.field !== 'startDate':
            change.field = '開始日';
            break;
          case change.field !== 'limitDate':
            change.field = '期限日';
            break;
          case change.field !== 'milestone':
            change.field = 'マイルストーン';
            break;
          case change.field !== 'resolution':
            change.field = '完了理由';
            change.old_value = getResolution(change.old_value);
            change.new_value = getResolution(change.new_value);
            break;
          case change.field !== 'estimatedHours':
            change.field = '予定時間';
            break;
          case change.field !== 'actualHours':
            change.field = '実績時間';
        }
        if (change.field.length > maxWidth) {
          maxWidth = change.field.length;
        }
        return change;
      }).map(function(change) {
        var field;
        field = rpad(change.field, maxWidth);
        return "  " + field + " : " + change.old_value + " -> " + change.new_value;
      }).join('\n');
      return "" + url + " " + c.summary + "\n" + userName + " " + ((_ref3 = a.content.comment) != null ? _ref3.content : void 0) + "\n" + changes;
    } else {
      return "" + url + " " + c.summary + "\n" + userName + " " + c.description;
    }
  };
  getMention = function(activity) {
    var assigner, c, mentionName, mentionNames;
    c = activity.content;
    assigner = c.changes.filter(function(change) {
      return change.field === '担当者';
    })[0];
    if (assigner == null) {
      return '';
    }
    mentionNames = JSON.parse(USER_MAPPINGS);
    mentionName = mentionNames[assigner.new_value];
    if (mentionName == null) {
      return '';
    }
    return mentionName;
  };
  sendActivity = function(robot, activity) {
    var mention, message, room, rooms, user, wrapped;
    rooms = JSON.parse(MAPPINGS);
    room = rooms[activity.project.projectKey];
    if (room == null) {
      return;
    }
    message = formatActivity(activity);
    wrapped = USE_SLACK ? '```\n' + message + '\n```' : message;
    mention = getMention(activity);
    if (mention != null) {
      if (USE_SLACK) {
        user = {
          name: mention
        };
        return robot.send({
          user: user,
          room: room
        }, mention + ': ' + wrapped);
      } else {
        user = robot.brain.userForName(mention);
        return robot.send({
          user: user,
          room: room
        }, wrapped);
      }
    } else {
      return robot.messageRoom(room, wrapped);
    }
  };
  fetchStatuses = function(callback) {
    var options;
    options = {
      url: "https://" + SPACE_ID + ".backlog.jp/api/v2/statuses",
      method: 'GET',
      qs: {
        apiKey: API_KEY
      }
    };
    return request(options, function(err, res) {
      if (err != null) {
        return callback(err);
      }
      return callback(null, JSON.parse(res.body));
    });
  };
  fetchResolutions = function(callback) {
    var options;
    options = {
      url: "https://" + SPACE_ID + ".backlog.jp/api/v2/resolutions",
      method: 'GET',
      qs: {
        apiKey: API_KEY
      }
    };
    return request(options, function(err, res) {
      if (err != null) {
        return callback(err);
      }
      return callback(null, JSON.parse(res.body));
    });
  };
  fetchActivity = function(callback) {
    var options;
    options = {
      url: "https://" + SPACE_ID + ".backlog.jp/api/v2/space/activities",
      method: 'GET',
      qs: {}
    };
    if (minId != null) {
      options.qs.minId = minId;
    }
    options.qs.apiKey = API_KEY;
    return request(options, function(err, res) {
      var activities, isFirst;
      if (err != null) {
        return callback(err);
      }
      activities = JSON.parse(res.body);
      isFirst = minId == null;
      if (activities.length > 0) {
        minId = activities[0].id;
      }
      return callback(null, (isFirst ? [] : activities));
    });
  };
  fetchAndSendActivity = function() {
    return fetchActivity(function(err, activities) {
      if (err != null) {
        robot.logger.error(err);
      } else {
        activities.forEach(function(activity) {
          return sendActivity(robot, activity);
        });
      }
      return setTimeout(fetchAndSendActivity, INTERVAL);
    });
  };
  fetchStatuses(function(err, r) {
    return statuses = r;
  });
  fetchResolutions(function(err, r) {
    return resolutions = r;
  });
  return fetchAndSendActivity();
};
