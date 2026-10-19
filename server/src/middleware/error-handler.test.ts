import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {errorHandler} from "./error-handler.js";

test("malformed and oversized JSON return safe client errors across routes", async () => {
  const app=express();
  app.use(express.json({limit:"100b"}));
  app.post("/test", (_req,res)=>{res.json({ok:true});});
  app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address();
  assert.ok(address && typeof address!=="string");
  try {
    for(const [body,status,message] of [
      ['{"password":"secret",',400,"invalid JSON"],
      [JSON.stringify({attachment:"x".repeat(200)}),413,"too large"],
    ] as const){
      const response: globalThis.Response=await fetch(`http://127.0.0.1:${address.port}/test`,{method:"POST",headers:{"Content-Type":"application/json"},body});
      assert.equal(response.status,status);
      const result=await response.json() as {error:string};
      assert.ok(result.error.includes(message));
      assert.ok(!JSON.stringify(result).includes("secret"));
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
});
