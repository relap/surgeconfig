/*
 * JMS 流量信息（ES5 兼容版）
 * 适配 JustMySocks getbwcounter.php
 * 返回示例:
 * {"monthly_bw_limit_b":100000000000,"bw_counter_b":8651882799,"bw_reset_day_of_month":16}
 */

(function () {
  try {
    var args = getArgs();
    if (!args.url) {
      return $done({
        title: (args.title || "JMS 流量信息") + " | 参数错误",
        content: "缺少 url 参数",
        icon: args.icon || "airplane.circle",
        "icon-color": args.color || "#FF3B30"
      });
    }

    getDataInfo(args.url, !!args.debug, function (info) {
      if (!info || typeof info.total !== "number" || typeof info.used !== "number") {
        return apiFormatError(args, "API响应格式错误");
      }

      var total = info.total;
      var used = info.used;
      if (used > total) used = total;
      var remain = total - used;
      if (remain < 0) remain = 0;

      var resetLeft = getRemainingDays(info.resetDay);

      var content = [];
      content.push("已用：" + toPercent(used, total) + " \t|  剩余：" + bytesToSize(remain));
      if (typeof resetLeft === "number") {
        content.push("重置：" + resetLeft + "天");
      }

      var now = new Date();
      var hh = ("0" + now.getHours()).slice(-2);
      var mm = ("0" + now.getMinutes()).slice(-2);

      $done({
        title: (args.title || "JMS 流量信息") + " | " + bytesToSize(total) + " | " + hh + ":" + mm,
        content: content.join("\n"),
        icon: args.icon || "airplane.circle",
        "icon-color": args.color || "#007aff"
      });
    });
  } catch (e) {
    console.log("脚本异常: " + String(e));
    $done({
      title: "JMS 流量信息 | 异常",
      content: "脚本运行异常，请查看日志",
      icon: "exclamationmark.triangle",
      "icon-color": "#FF3B30"
    });
  }
})();

/* ---------------- Utils ---------------- */

function apiFormatError(args, msg) {
  return $done({
    title: (args.title || "JMS 流量信息") + " | 错误",
    content: msg,
    icon: args.icon || "exclamationmark.triangle",
    "icon-color": args.color || "#FF3B30"
  });
}

/**
 * 鲁棒解析 $argument：
 * - 专门截取 url= ... 到下一个已知键的范围（即使未编码也能拿到完整 URL）
 * - 其它键再单独解析
 */
function getArgs() {
  var raw = $argument || "";
  var out = {};
  var knownKeys = ["title", "icon", "color", "expire", "reset_day", "debug"];

  // 抓 url
  var idx = raw.indexOf("url=");
  var cutStart = -1;
  var cutEnd = -1;
  if (idx >= 0) {
    cutStart = idx + 4; // "url=".length
    cutEnd = raw.length;
    // 找到离 url= 最近的下一个已知键位置
    for (var i = 0; i < knownKeys.length; i++) {
      var key = "&" + knownKeys[i] + "=";
      var p = raw.indexOf(key, cutStart);
      if (p !== -1 && p < cutEnd) cutEnd = p;
    }
    var urlEncoded = raw.substring(cutStart, cutEnd);
    try {
      out.url = decodeURIComponent(urlEncoded);
    } catch (e) {
      out.url = urlEncoded;
    }
  }

  // 去掉 url= 片段后解析其它键
  var rest = raw;
  if (idx >= 0) {
    rest = raw.substring(0, idx) + raw.substring(cutEnd);
  }
  var parts = rest.split("&");
  for (var j = 0; j < parts.length; j++) {
    if (!parts[j]) continue;
    var eq = parts[j].indexOf("=");
    if (eq === -1) continue;
    var k = parts[j].substring(0, eq);
    var v = parts[j].substring(eq + 1);
    if (!k || k === "url") continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch (e2) {
      out[k] = v;
    }
  }
  return out;
}

// 请求并解析 JMS JSON
function getDataInfo(url, debug, cb) {
  var headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Surge",
    "Accept": "application/json, text/plain, */*",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache"
  };

  $httpClient.get({ url: url, headers: headers }, function (err, resp, data) {
    if (err) {
      console.log("HTTP错误: " + JSON.stringify(err));
      return cb(null);
    }
    var status = (resp && (resp.status || resp.statusCode)) || 0;
    var raw = (typeof data === "string" && data.length) ? data : (resp && resp.body) || "";

    if (debug) {
      try { console.log("HTTP Status: " + status); } catch (e) {}
      try { console.log("Raw Body: " + String(raw)); } catch (e2) {}
    }

    if (status !== 200) {
      console.log("非 200 返回: " + status);
      return cb(null);
    }

    try {
      var json = JSON.parse(String(raw).trim());
      if (typeof json.monthly_bw_limit_b !== "number" || typeof json.bw_counter_b !== "number") {
        console.log("缺少必要字段");
        return cb(null);
      }
      var total = json.monthly_bw_limit_b;
      var used = json.bw_counter_b;
      var resetDay = json.bw_reset_day_of_month;
      return cb({ total: total, used: used, resetDay: resetDay });
    } catch (e3) {
      console.log("JSON解析失败: " + String(e3));
      return cb(null);
    }
  });
}

// 计算距重置日剩余天数（允许返回 0，表示今天重置）
function getRemainingDays(resetDay) {
  if (resetDay === undefined || resetDay === null) return undefined;
  resetDay = Number(resetDay);
  if (isNaN(resetDay) || resetDay <= 0) return undefined;

  var now = new Date();
  var today = now.getDate();
  var month = now.getMonth();
  var year = now.getFullYear();

  var daysInMonth;
  if (resetDay > today) {
    daysInMonth = 0;
  } else {
    daysInMonth = new Date(year, month + 1, 0).getDate();
  }
  return daysInMonth - today + resetDay;
}

function bytesToSize(bytes) {
  if (!bytes || bytes <= 0) return "0B";
  var k = 1024;
  var sizes = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function toPercent(num, total) {
  if (!total || total <= 0) return "0.0%";
  return (Math.round((num / total) * 10000) / 100).toFixed(1) + "%";
}