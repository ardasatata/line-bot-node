require('dotenv').config()
// Import all dependencies, mostly using destructuring for better view.
import { ClientConfig, Client, middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase, TextEventMessage } from '@line/bot-sdk';
import express, { Application, Request, response, Response } from 'express';
import moment from 'moment-timezone';
import * as admin from 'firebase-admin'; // Firebase Imports
import { Console, group, time } from 'console';
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
          // eg: /schedule taoyuan-city
          if(command==='/schedule'){
            
            // length of command + remove '-' char change to space
            const city:string = text.substring(10).replace(/-/g, ' ')
            console.log(`Get schedule for ${toTitleCase(city)}`)

            //@ts-ignore
            const res: Array<any> = await getTodayPrayerData(city)
            //@ts-ignore
            const timings: PrayerTimingsType = res.timmings;

            response = {
              type: 'text',
              text: 
                `Today Prayer Times for ${toTitleCase(city)} 🕌\n`+
                `🌄 Fajr : ${timings.Fajr}\n`+
                `🌅 Sunrise : ${timings.Sunrise}\n`+
                `☀️ Dhuhr : ${timings.Dhuhr}\n`+
                `🌆 Asr : ${timings.Asr}\n`+
                `🌇 Maghrib : ${timings.Maghrib}\n`+
                `🌃 Isha : ${timings.Isha}`,
            };
            // Send message to LINE
            client.replyMessage(replyToken, response)
          }

          else if(command==='/check'){
            console.log('checking')
          }

          // Group message type handler
          if(event.source.type=='group'){

            // command : /register [city] [country] [group-name]
            //       eg: /register taoyuan-city taiwan Musholla-1
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

                // if new group added cancel all jobs & generate new scheduler
                cancelAllJobs();
                generateSchedule();
                refreshSchedule(); // it would run on loop daily
                
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

  cancelAllJobs();

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
      startReminder(item.name, item.time, groupId, location, '')
    })
  })

  return res.status(200).json({
    status: 'success',
    response
  });
})

// Cancel Scheduler
app.get('/cancel-schedule', async (req: Request, res: Response): Promise<Response> =>{

  cancelAllJobs();

  return res.status(200).json({
    status: 'success',
  });
})

// Print all Scheduler
app.get('/print-all-job', async (req: Request, res: Response): Promise<Response> =>{

  printAllJobs();

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

// Test Scheduler at specific time
app.get('/test-scheduler', async (req: Request, res: Response): Promise<Response> =>{

  let time = req.query.time;
  let timezone = req.query.timezone;
  let location = req.query.location;
  let group = req.query.group;

    // @ts-ignore
    const response: PrayerTimesData = await getTodayPrayerData(location);

    console.log(response)

    // @ts-ignore
    startReminder('Test-Time', generatePrayerTimingUnix(time, timezone), group, location, timezone );

  return res.status(200).json({
    status: 'success',
    response
  });
})

// Create reminder scheduler/job per prayer time 
const startReminder = (prayerName: string, timeValue: number, groupId: string, location: string, timezone: string) => {

  const date = new Date(timeValue * 1000)

  const options = {
    timeZone : timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }

  const response: TextMessage = {
    type: 'text',
    // @ts-ignore
    text: `🕌 It's time to ${toTitleCase(prayerName)} in ${toTitleCase(location.replace(/-/g, ' '))}\n`+`Time : ${date.toLocaleTimeString( 'en-US' , options )}`
  };

  // Scheduler Job
  const job = schedule.scheduleJob(
    // @ts-ignore
    `${toTitleCase(prayerName)} in ${toTitleCase(location)} ${date.toLocaleTimeString( 'en-US' , options )} ${timeValue}`
    ,new Date(timeValue * 1000), 
        async function(){
          await client.pushMessage(groupId, response)
          await console.log(response);
      });
}

// Check Group id
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
const getTodayPrayerData = async (city: string, school: string = '3') => {

  let prayerTimeData: AxiosResponse<any>;

  prayerTimeData = await axios.get("https://api.pray.zone/v2/times/today.json", {
    params: {
      city: city,
      school: school
    }
  })

  let response:PrayerTimesData = {
    country: prayerTimeData.data.results.location.country,
    timezone: prayerTimeData.data.results.location.timezone,
    timmings: prayerTimeData.data.results.datetime[0].times
  }

  return response
}

// Unix Time Generator
const generatePrayerTimingUnix = (prayerTime:string, timezone:string) => {
  // console.log('Generate Unix Time '+ prayerTime)

  const currentTime = moment.tz(timezone).unix()
  const timeValue = moment.tz(`${moment.tz(timezone).format().slice(0, -15)} ${prayerTime}`, timezone).unix()

  // if scheduler time less than current time add 1 more day
  if (timeValue < currentTime){
    const plus1Day = moment.tz(`${moment.tz(timezone).format().slice(0, -15)} ${prayerTime}`, timezone).add(1, 'days').unix()
    return plus1Day;
  }
  // return normal time value
  return timeValue;
}

// Generate prayer time reminder from all groups
const generateSchedule = async () => {
  console.log('Generate All scheduler for groups')

  // Fetch All groups
  const getGroupData = await db.collection("Groups").get()
  
  // Map all groups
  const schedule = getGroupData.docs.map(async (group) => {

    // fetch prayer times data from location
    const response: PrayerTimesData = await getTodayPrayerData(group.data().location);

    // Map all prayer time
    PrayerTimings.map(timing => {
      //@ts-ignore
      startReminder(timing, generatePrayerTimingUnix(response.timmings[timing], response.timezone), group.data().id, group.data().location, response.timezone );
    });

    console.log(response);
  })

}

// Register new group
const registerNewGroup = async (groupItem: GroupItemsType) => {
  return await db.collection('Groups').doc(groupItem.id).set(groupItem);
}

// Create a server and listen to it.
app.listen(PORT, () => {
  console.log(`Application is live and listening on port ${PORT}`);
});

// Test function to send message with scheduler
const test_function = () => {
  const now = moment()

  cancelAllJobs();

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
      startReminder(item.name, item.time, groupId, location, '')
    })
  })

}

// Cancel All scheduler jobs
const cancelAllJobs = () => {
  console.log('Cancel All Jobs')
  for (const job in schedule.scheduledJobs) schedule.cancelJob(job);
}

// Print All scheduler jobs
const printAllJobs = () => {
  console.log('Print All Jobs')
  for (const job in schedule.scheduledJobs) console.log(job);
}

// Daily Task 
const refreshSchedule = () => {
    // Scheduler Job running every midnight
    const job = schedule.scheduleJob('Daily Scheduler Refresh',{hour: 0, minute: 0}, 
    async function(){
      // Cancel All Jobs before generate new one
      cancelAllJobs();
      console.log('Daily Scheduler Refresh')
      generateSchedule();
  });
}

// *** Run on start
console.log('Bot Starting...')
generateSchedule();
refreshSchedule(); // it would run on loop daily
console.log('Bot Init OK')