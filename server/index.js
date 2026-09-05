import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase,getToday,createSession,getSession,setTarget,logSet,skipSet,addReps,undoReps,correctTotal,resolveExercise,completeSession,correctSet } from './db.js';

const app=express(); const db=openDatabase();
app.use((req,res,next)=>{
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    const origins = new Set(process.env.APP_ORIGIN
      ? [process.env.APP_ORIGIN]
      : ['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3001','http://localhost:3001']);
    if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site']==='cross-site') {
      return res.status(403).json({error:'Origin not allowed'});
    }
    if (!req.is('application/json')) return res.status(415).json({error:'Application JSON required'});
  }
  next();
});
app.use(express.json({limit:'64kb'}));
const asyncRoute=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
app.get('/api/health',(_req,res)=>{
  try {
    db.prepare('SELECT id FROM app_settings LIMIT 1').get();
    res.json({ok:true,database:true});
  } catch {
    res.status(503).json({ok:false,database:false});
  }
});
app.get('/api/today',(_req,res)=>res.json(getToday(db)));
app.post('/api/sessions',asyncRoute((req,res)=>res.status(201).json(createSession(db,req.body))));
app.get('/api/sessions/:id',(req,res)=>{const x=getSession(db,req.params.id);x?res.json(x):res.status(404).json({error:'Session not found'})});
app.patch('/api/sessions/:id/exercises/:exerciseId/target',asyncRoute((req,res)=>res.json(setTarget(db,req.params.id,req.params.exerciseId,req.body))));
app.post('/api/sessions/:id/sets/:setId/log',asyncRoute((req,res)=>res.json(logSet(db,req.params.id,req.params.setId,req.body))));
app.post('/api/sessions/:id/sets/:setId/skip',asyncRoute((req,res)=>res.json(skipSet(db,req.params.id,req.params.setId,req.body))));
app.post('/api/sessions/:id/exercises/:exerciseId/reps',asyncRoute((req,res)=>res.json(addReps(db,req.params.id,req.params.exerciseId,req.body))));
app.post('/api/sessions/:id/exercises/:exerciseId/reps/undo',asyncRoute((req,res)=>res.json(undoReps(db,req.params.id,req.params.exerciseId,req.body))));
app.patch('/api/sessions/:id/exercises/:exerciseId/total',asyncRoute((req,res)=>res.json(correctTotal(db,req.params.id,req.params.exerciseId,req.body))));
app.post('/api/sessions/:id/exercises/:exerciseId/complete',asyncRoute((req,res)=>res.json(resolveExercise(db,req.params.id,req.params.exerciseId,req.body,'completed'))));
app.post('/api/sessions/:id/exercises/:exerciseId/skip',asyncRoute((req,res)=>res.json(resolveExercise(db,req.params.id,req.params.exerciseId,req.body,'skipped'))));
app.post('/api/sessions/:id/complete',asyncRoute((req,res)=>res.json(completeSession(db,req.params.id,req.body))));
app.patch('/api/sets/:setId',asyncRoute((req,res)=>res.json(correctSet(db,req.body.sessionId,req.params.setId,req.body))));
app.use((err,_req,res,_next)=>{console.error(err);const body={error:err.message};if(err.current)body.current=err.current;if(err.activeSessionId)body.activeSessionId=err.activeSessionId;res.status(err.status||500).json(body)});
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
app.use(express.static(dist)); app.get('/{*splat}',(_req,res,next)=>res.sendFile(path.join(dist,'index.html'),e=>e&&next()));
const port=Number(process.env.PORT||3001); const host=process.env.HOST||'127.0.0.1'; const server=app.listen(port,host,()=>console.log(`Workout Tracker API http://${host}:${port}`));
process.on('SIGTERM',()=>server.close(()=>db.close()));
