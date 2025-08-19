/*
 * JMS 流量信息（ES5 兼容版）
 * 适配 JustMySocks getbwcounter.php
 * 返回示例:
 * {"monthly_bw_limit_b":100000000000,"bw_counter_b":8816332887,"bw_reset_day_of_month":16}
 * 需求：
 * - 标题固定为 "JustMySocks LA100 | 100.00GB"
 * - 总流量固定按十进制 100GB(=100,000,000,000 字节)
 * - 已用显示为十进制GB（例：8816332887 -> 8.816GB）并附百分比
 * - content 一行显示：已用 | 剩余 | 重置
 */

(function () {
  try {
    var args = getArgs();
    if (!args.url) {
      return $done({
        title: "JustMySocks LA100 | 100.00GB",
        content: "缺少 url 参数",
        icon: args.icon || "airplane.circle",
        "icon-color": args.color || "#FF3B30"
      });
    }

    getDataInfo(args.url, !!args.debug, function (info) {
      if (!info || typeof info.used !== "number") {
        return apiFormatError("API响应格式错误");
      }

      // —— 固定总流量：十进制 100GB ——
      var TOTAL_BYTES_DEC = 100000000000; // 100e9
      var usedBytes = info.used;
      if (usedBytes < 0) usedBytes = 0;
      if (usedBytes > TOTAL_BYTES_DEC) usedBytes = TOTAL_BYTES_DEC;

      var remainBytes = TOTAL_BYTES_DEC - usedBytes;

      // 十进制 GB（1GB = 1e9 bytes）
      var usedGB_dec = usedBytes / 1000000000;
      var remainGB_dec = remainBytes / 1000000000;

      // 已用百分比（一位小数）
      var usedPercent = toPercent(usedBytes, TOTAL_BYTES_DEC);

      // 文本格式：已用显示到 3 位小数，剩余 2 位小数（可按需调整）
      var usedText = usedGB_dec.toFixed(2) + "GB";
      var remainText = remainGB_dec.toFixed(2) + "GB";

      // 重置天数
      var resetLeft = getRemainingDays(info.resetDay);
      var content = "已用: " + usedText + " (" + usedPercent + ") | 剩余: " + remainText;
      if (typeof resetLeft === "number") {
        content += " | 重置: " + resetLeft + "天";
      }

      $done({
        title: "JustMySocks LA100 | 100.00GB",
        content: content,
        icon: args.icon || "airplane.circle",
        "icon-color": args.color || "#007aff"
      });
    });
  } catch (e) {
    console.log("脚本异常: " + String(e));
    $done({
      title: "JustMySocks LA100 | 100.00GB",
      content: "脚本运行异常，请查看日志",
      icon: "exclamationmark.triangle",
      "icon-color": "#FF3B30"
    });
  }
})();

/* ---------------- Utils ---------------- */

function apiFormatError(msg) {
  return $done({
    title: "JustMySocks LA100 | 100.00GB",
    content: msg,
    icon: "exclamationmark.triangle",
    "icon-color": "#FF3B30"
  });
}

/**
 * 鲁棒解析 $argument：
 * - 专门截取 url= ... 到下一个已知键（即使未编码也能拿到完整 URL）
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
      if (typeof json.bw_counter_b !== "number") {
        console.log("缺少必要字段");
        return cb(null);
      }
      var used = json.bw_counter_b; // 已用字节（十进制）
      var resetDay = json.bw_reset_day_of_month; // 重置日（1-31）
      return cb({ used: used, resetDay: resetDay });
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

// 百分比（保留 1 位小数）
function toPercent(num, total) {
  if (!total || total <= 0) return "0.0%";
  return (Math.round((num / total) * 10000) / 100).toFixed(1) + "%";
}
