require('dotenv').config()
// Import all dependencies, mostly using destructuring for better view.
import { ClientConfig, Client, middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase, TextEventMessage } from '@line/bot-sdk';
import express, { Application, Request, response, Response } from 'express';
import moment from 'moment-timezone';
import * as admin from 'firebase-admin'; // Firebase Imports
import { group } from 'console';
import axios, { AxiosResponse } from 'axios'

// Import module
import { DailyReminderType, GroupItemsType, PrayerTimingsType, SchedulesType, PrayerTimesData, PrayerTimings } from './type'
import { toTitleCase } from './utils'

const schedule = require('node-schedule');

// Config PORT
const PORT = process.env.PORT || 3000;

// Create a new Express application.
const app: Application = express();

// Firebase Init
admin.initializeApp({
  credential: admin.credential.cert({
    "projectId": process.env.FIREBASE_PROJECT_ID,
    "privateKey": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "clientEmail": process.env.FIREBASE_CLIENT_EMAIL,
  })
});

const db = admin.firestore();

/*
 * LINE CONFIG START
 */

// Setup all LINE client and Express configurations.
const clientConfig: ClientConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET,
};

const middlewareConfig: MiddlewareConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN ,
  channelSecret: process.env.CHANNEL_SECRET || '',
};

// // Create a new LINE SDK client.
const client = new Client(clientConfig);

// // Function handler to receive the text.
const textEventHandler = async (event: WebhookEvent): Promise<MessageAPIResponseBase | undefined> => {

  console.log(event)

  // Process all variables here.
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  // Process all message related variables here.
  const { replyToken } = event;
  const { text } = event.message;

  // Create a new message.
  const response: TextMessage = {
    type: 'text',
    text,
  };

  // Reply to the user.
  await client.replyMessage(replyToken, response);
};

// Register the LINE middleware.
// As an alternative, you could also pass the middleware in the route handler, which is what is used here.
// app.use(middleware(middlewareConfig));

// Route handler to receive webhook events.
// This route is used to receive connection tests.
app.get(
  '/',
  async (_: Request, res: Response): Promise<Response> => {
    return res.status(200).json({
      status: 'success',
      message: 'Connected successfully!',
    });
  }
);

// This route is used for the Webhook.
app.post(
  '/webhook',
  middleware(middlewareConfig),
  async (req: Request, res: Response): Promise<Response> => {
    const events: WebhookEvent[] = req.body.events;

    // Process all of the received events asynchronously.
    const results = await Promise.all(
      events.map(async (event: WebhookEvent) => {
        try {
          // echo tester all event
          // await textEventHandler(event);

          //@ts-ignore
          const { replyToken } = event;

          //@ts-ignore
          const { text } = event.message;

          const textSplit = text.split(" ");
          const command = textSplit[0];

          let response:TextMessage;

          // eg: /schedule [city] 
          // eg: /schedule taipei
          if(command==='/schedule'){
            
            const city = textSplit[1];
            console.log(`get schedule for ${toTitleCase(city)}`)

            //@ts-ignore
            const res: Array<any> = await getTodayPrayerSchedule(city)
            //@ts-ignore
            const timings: PrayerTimingsType = res;

            response = {
              type: 'text',
              text: 
                `Today Prayer Times for ${toTitleCase(city)}\n`+
                `Fajr : ${timings.Fajr}\n`+
                `Sunrise : ${timings.Sunrise}\n`+
                `Dhuhr : ${timings.Dhuhr}\n`+
                `Asr : ${timings.Asr}\n`+
                `Maghrib : ${timings.Maghrib}\n`+
                `Isha : ${timings.Isha}\n`,
            };
            client.replyMessage(replyToken, response)
          }

          else if(command==='/check'){
            console.log('checking')
          }

          // Group message type handler
          if(event.source.type=='group'){
            console.log('this is message type group only')

            // command : /register [city] [country] [group-name]
            //       eg: /register zhongli taiwan Musholla-1
            if(command==='/register'){
              console.log('register command')
              console.log(`location ${textSplit[1]}, group name ${textSplit[2]}`)

              const groupItem:GroupItemsType = {
                id: event.source.groupId,
                location: textSplit[1],
                country: textSplit[2],
                name: textSplit[3],
                isActive: true
              }
            
              const addNewGroup = await registerNewGroup(groupItem)

              if(addNewGroup){
                // Create a new message.
                response = {
                  type: 'text',
                  text: `Group Registered, id : ${groupItem.id}, location : ${groupItem.location}, country : ${groupItem.country} groupName : ${groupItem.name}`,
                };
                console.log(response)
                console.log(replyToken)
                client.replyMessage(replyToken, response)
              }
            }
            else if(command==='/check'){
              checkGroupId(event);
            }
            else if(command==='/pause'){
              console.log(command)
            }
          }

        } catch (err: unknown) {
          if (err instanceof Error) {
            console.error(err);
          }

          // Return an error message.
          return res.status(500).json({
            status: 'error',
          });
        }
      })
    );

    // Return a successfull message.
    return res.status(200).json({
      status: 'success',
      results,
    });
  }
);
/*
 * LINE CONFIG END
 */


import {PRAYER_TIME_NAMES} from './example'

const debugTime = 's'

const generateSchedules = () => {
  
  const schedules:Array<SchedulesType> = []

  const now = moment()
  console.log(now)

  let count = 1

  PRAYER_TIME_NAMES.map((item)=>{
    const schedule:SchedulesType = {
      name: item,
      time: now.add(count, debugTime).unix()
    }
    count += 1

    schedules.push(schedule)
  })

  return schedules
}

const REMINDER_LIST: Array<DailyReminderType> = [
  {
    id : 0,
    groupId : 'C048ee0720fddc0f9e107e6ffa7bc7f28',
    location : 'zhongli',
    schedules : [
      {
        name: 'fajr',
        time: moment().add(1, debugTime).unix()
      },
      {
        name: 'duhr',
        time: moment().add(2, debugTime).unix()
      },
      {
        name: 'asr',
        time: moment().add(3, debugTime).unix()
      },
      {
        name: 'maghrib',
        time: moment().add(4, debugTime).unix()
      },
      {
        name: 'isha',
        time: moment().add(5, debugTime).unix()
      },
    ]
  },
  {
    id : 1,
    groupId : 'Cdbd57fd622114d68bab8ec8a0062faef',
    location : 'malang',
    schedules : [
      {
        name: 'fajr',
        time: moment().add(86, 's').unix()
      },
      {
        name: 'duhr',
        time: moment().add(87, 's').unix()
      },
      {
        name: 'asr',
        time: moment().add(88, 's').unix()
      },
      {
        name: 'maghrib',
        time: moment().add(89, 's').unix()
      },
      {
        name: 'isha',
        time: moment().add(90, 's').unix()
      }
    ]
  }
]

app.get('/send-message', async (req: Request, res: Response): Promise<Response> =>{

  const now = moment()

  //cancel existing job run whenever new group added
  for (const job in schedule.scheduledJobs) schedule.cancelJob(job);

  const textEventMessage : TextEventMessage = {
    id: '0',
    text: 'halo semua',
    type: 'text'
  }

  const { text } = textEventMessage
  
  // Create a new message.
  const response: TextMessage = {
    type: 'text',
    text,
  };

  REMINDER_LIST.map((item)=>{
    console.log(item.groupId)

    const groupId = item.groupId
    const location = item.location

    const schedules = generateSchedules()

    schedules.map((item)=>{
      console.log(new Date(item.time * 1000))
      startReminder(item.name, item.time, groupId, location)
    })
  })

  return res.status(200).json({
    status: 'success',
    response
  });
})

// Cancel Scheduler
app.get('/cancel-schedule', async (req: Request, res: Response): Promise<Response> =>{

  const now = moment()

  //cancel existing job run whenever new group added
  for (const job in schedule.scheduledJobs) schedule.cancelJob(job);

  return res.status(200).json({
    status: 'success',
  });
})

// Test send message to group
app.get('/test', async (req: Request, res: Response): Promise<Response> =>{

  let response:TextMessage;

  const groupId = "C048ee0720fddc0f9e107e6ffa7bc7f28"

  // @ts-ignore
  const getGroupData = await db.collection("Groups").doc(groupId).get().then( returnData =>{
    if (returnData.exists){
      // @ts-ignore
      var name = returnData.data().name
      // @ts-ignore
      var location = returnData.data().location

      // Create a new message.
      const res: TextMessage = {
        type: 'text',
        text: `${name} ${location}`,
      };

      response = res;

    } else {

      // Create a new message.
      const res: TextMessage = {
        type: 'text',
        text: `You are not registed yet`,
      };

      response = res;
    }
    return null
  }).catch(err => {
      console.log(err)
  }).then(()=>{
    console.log(response)
    // send message to group
    client.pushMessage(groupId, response)
  })
  
  return res.status(200).json({
    status: 'success',
    response: 'test message to specific group'
  });
})

// test api from pray.zone
app.get('/test-api-new', async (req: Request, res: Response): Promise<Response> =>{

  generateSchedule();

  return res.status(200).json({
    status: 'success',
    // response
  });
})

// Create reminder scheduler/job per prayer time 
const startReminder = (prayerName: string, timeValue: number, groupId: string, location: string) => {

  const response: TextMessage = {
    type: 'text',
    text: `It's time to ${toTitleCase(prayerName)} in ${toTitleCase(location)}, Time : ${new Date(timeValue * 1000)}`
  };

  // Scheduler Job
  const job = schedule.scheduleJob(new Date(timeValue * 1000), 
        async function(){
          await client.pushMessage(groupId, response)
          await console.log(response);
      });
}

const checkGroupId = async (event: WebhookEvent) => {

    // @ts-ignore
  const { replyToken } = event;

  let response:TextMessage;

  // @ts-ignore
  const getGroupData = await db.collection("Groups").doc(event.source.groupId).get().then( returnData =>{
    if (returnData.exists){
      // @ts-ignore
      var groupName = returnData.data().id
      // @ts-ignore
      var location = returnData.data().location
      // @ts-ignore
      var name = returnData.data().name

      // Create a new message.
      const res: TextMessage = {
        type: 'text',
        text: `Data Updated. \n
              id : ${groupName}\n
              location : ${location}\n
              name : ${name}\n`,
      };

      response = res;

    } else {

      // Create a new message.
      const res: TextMessage = {
        type: 'text',
        text: `You are not registed yet`,
      };

      response = res;
    }
    // console.log(response)
    // console.log(replyToken)
    client.replyMessage(replyToken, response)
  }).catch(err => {
      console.log('error get group data')
      console.log(err)
  })
}

// Get API Pray Zone
const getTodayPrayerSchedule = async (city: string) => {

  let prayerTimeData: AxiosResponse<any>;

  prayerTimeData = await axios.get("https://api.pray.zone/v2/times/today.json", {
    params: {
      city: city,
    }
  })

  return prayerTimeData.data.results.datetime[0].times
}

// Get API Pray Zone
const getTodayPrayerData = async (city: string) => {

  let prayerTimeData: AxiosResponse<any>;

  prayerTimeData = await axios.get("https://api.pray.zone/v2/times/today.json", {
    params: {
      city: city,
    }
  })

  let response:PrayerTimesData = {
    country: prayerTimeData.data.results.location.country,
    timezone: prayerTimeData.data.results.location.timezone,
    timmings: prayerTimeData.data.results.datetime[0].times
  }

  return response
}

const generatePrayerTimingUnix = (prayerTime:string, timezone:string) => {
  return moment.tz(`${moment().format().slice(0, -15)} ${prayerTime}`, timezone).unix()
}

const example_response = {
  country: 'Taiwan',
  timezone: 'Asia/Taipei',
  timmings: {
    Imsak: '03:53',
    Sunrise: '05:22',
    Fajr: '04:03',
    Dhuhr: '11:52',
    Asr: '17:26',
    Maghrib: '17:28',
    Isha: '17:30',
    Midnight: '23:12'
  }
}

const generateSchedule = async () => {
  // Fetch All groups
  const getGroupData = await db.collection("Groups").get()
  
  const schedule = getGroupData.docs.map(async (group) => {

    const response: PrayerTimesData = await getTodayPrayerData(group.data().location);

    PrayerTimings.map(timing => {
      //@ts-ignore
      // const generated_unix = generatePrayerTimingUnix(response.timmings[timing], response.timezone);
      console.log(timing);
      //@ts-ignore
      // console.log(generatePrayerTimingUnix(response.timmings[timing], response.timezone))
      //@ts-ignore
      startReminder(timing, generatePrayerTimingUnix(example_response.timmings[timing], response.timezone), group.data().id, group.data().location);

      //@ts-ignore
      console.log(example_response.timmings[timing]);
    });

    console.log(response);
  })

}

const registerNewGroup = async (groupItem: GroupItemsType) => {
  return await db.collection('Groups').doc(groupItem.id).set(groupItem);
}

// Create a server and listen to it.
app.listen(PORT, () => {
  console.log(`Application is live and listening on port ${PORT}`);
});

const test_function = () => {
  const now = moment()

  //cancel existing job run whenever new group added
  for (const job in schedule.scheduledJobs) schedule.cancelJob(job);

  const textEventMessage : TextEventMessage = {
    id: '0',
    text: 'halo semua',
    type: 'text'
  }

  const { text } = textEventMessage
  
  // Create a new message.
  const response: TextMessage = {
    type: 'text',
    text,
  };

  REMINDER_LIST.map((item)=>{
    console.log(item.groupId)

    const groupId = item.groupId
    const location = item.location

    const schedules = generateSchedules()

    schedules.map((item)=>{
      console.log(new Date(item.time * 1000))
      startReminder(item.name, item.time, groupId, location)
    })
  })

    // Scheduler Job
    const job = schedule.scheduleJob('*/5 * * * * *', 
    async function(){
      console.log(new Date())
      console.log('LOG scheduler')
  });
}

// Run on start
test_function();