import http from "http";

http.get("http://localhost:4000/api/markets", (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    console.log("STATUS CODE:", res.statusCode);
    console.log("HEADERS:", res.headers);
    console.log("RESPONSE DATA:", data);
    process.exit(0);
  });
}).on("error", (err) => {
  console.error("API REQUEST ERROR:", err.message);
  process.exit(1);
});
