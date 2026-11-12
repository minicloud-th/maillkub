import {createApp} from './app.mjs';
const port=Number(process.env.PORT)||4173;
const app=await createApp({origin:process.env.APP_ORIGIN||`http://127.0.0.1:${port}`});
app.server.listen(port,'0.0.0.0',()=>console.log(`Maillkub http://127.0.0.1:${port}`));
