# Description
#   A Hubot script that relay the backlog activities to your chat room.
#
# Dependencies:
#   "request": "^2.40.0"
#
# Configuration:
#   HUBOT_BACKLOG_ACTIVITY_SPACE_ID
#   HUBOT_BACKLOG_ACTIVITY_API_KEY
#   HUBOT_BACKLOG_ACTIVITY_MAPPINGS
#   HUBOT_BACKLOG_ACTIVITY_USER_MAPPINGS
#   HUBOT_BACKLOG_ACTIVITY_INTERVAL
#   HUBOT_BACKLOG_ACTIVITY_USE_SLACK
#
# Author:
#   bouzuya <m@bouzuya.net>
#
request = require 'request'

module.exports = (robot) ->
  SPACE_ID = process.env.HUBOT_BACKLOG_ACTIVITY_SPACE_ID
  API_KEY = process.env.HUBOT_BACKLOG_ACTIVITY_API_KEY
  MAPPINGS = process.env.HUBOT_BACKLOG_ACTIVITY_MAPPINGS ? '{}'
  USER_MAPPINGS = process.env.HUBOT_BACKLOG_ACTIVITY_USER_MAPPINGS ? '{}'
  INTERVAL = process.env.HUBOT_BACKLOG_ACTIVITY_INTERVAL ? 30000
  USE_SLACK = process.env.HUBOT_BACKLOG_ACTIVITY_USE_SLACK?

  statuses = []
  resolutions = []
  minId = null

  rpad = (s, l) ->
    while s.length < l
      s += '  ' # full width for japanese
    s

  getStatus = (value) ->
    status = statuses.filter((i) -> i.id is parseInt(value, 10))[0]
    status?.name ? value

  getResolution = (value) ->
    resolution = resolutions.filter((r) -> r.id is parseInt(value, 10))[0]
    resolution?.name ? value

  formatActivity = (activity) ->
    a = activity
    c = a.content
    userName = a.createdUser.name
    issueKey = "#{a.project.projectKey}-#{a.content.key_id}"
    url = "https://#{SPACE_ID}.backlog.jp/view/#{issueKey}"
    if c.comment?
      # switch status or add comment
      maxWidth = 0
      changes = c.changes.map (change) ->
        switch
          when change.field is 'status'
            change.field = '状態'
            change.old_value = getStatus change.old_value
            change.new_value = getStatus change.new_value
          when change.field is 'assigner' then change.field = '担当者'
          when change.field is 'startDate' then change.field = '開始日'
          when change.field is 'limitDate' then change.field = '期限日'
          when change.field is 'milestone' then change.field = 'マイルストーン'
          when change.field is 'resolution'
            change.field = '完了理由'
            change.old_value = getResolution change.old_value
            change.new_value = getResolution change.new_value
          when change.field is 'estimatedHours' then change.field = '予定時間'
          when change.field is 'actualHours' then change.field = '実績時間'
        maxWidth = change.field.length if change.field.length > maxWidth
        change
      .map (change) ->
        field = rpad(change.field, maxWidth)
        "  #{field} : #{change.old_value} -> #{change.new_value}"
      .join '\n'
      """
        #{url} #{c.summary}
        #{userName} #{a.content.comment?.content}
        #{changes}
      """
    else
      # create issue
      """
        #{url} #{c.summary}
        #{userName} #{c.description}
      """

  getMention = (activity) ->
    c = activity.content
    assigner = c.changes.filter((change) -> change.field is '担当者')[0]
    return '' unless assigner?
    mentionNames = JSON.parse USER_MAPPINGS
    mentionName = mentionNames[assigner.new_value]
    return '' unless mentionName?
    mentionName

  sendActivity = (robot, activity) ->
    rooms = JSON.parse(MAPPINGS)
    room = rooms[activity.project.projectKey]
    return unless room?
    message = formatActivity activity
    wrapped = if USE_SLACK then '```\n' + message + '\n```' else message
    mention = getMention activity
    if mention?
      user = robot.brain.userForName mention
      robot.send { user, room }, wrapped
    else
      robot.messageRoom room, wrapped

  fetchStatuses = (callback) ->
    options =
      url: "https://#{SPACE_ID}.backlog.jp/api/v2/statuses"
      method: 'GET'
      qs:
        apiKey: API_KEY
    request options, (err, res) ->
      return callback(err) if err?
      callback null, JSON.parse(res.body)

  fetchResolutions = (callback) ->
    options =
      url: "https://#{SPACE_ID}.backlog.jp/api/v2/resolutions"
      method: 'GET'
      qs:
        apiKey: API_KEY
    request options, (err, res) ->
      return callback(err) if err?
      callback null, JSON.parse(res.body)

  fetchActivity = (callback) ->
    options =
      url: "https://#{SPACE_ID}.backlog.jp/api/v2/space/activities"
      method: 'GET'
      qs: {}
    options.qs.minId = minId if minId?
    options.qs.apiKey = API_KEY
    request options, (err, res) ->
      return callback(err) if err?
      activities = JSON.parse(res.body)
      isFirst = !minId?
      minId = activities[0].id if activities.length > 0
      callback null, (if isFirst then [] else activities)

  fetchAndSendActivity = ->
    fetchActivity (err, activities) ->
      if err?
        robot.logger.error err
      else
        activities.forEach (activity) ->
          sendActivity robot, activity
      setTimeout fetchAndSendActivity, INTERVAL

  fetchStatuses (err, r) -> statuses = r
  fetchResolutions (err, r) -> resolutions = r
  fetchAndSendActivity()
