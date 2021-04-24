require('dotenv').config()
// Import all dependencies, mostly using destructuring for better view.
import { ClientConfig, Client, middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase, TextEventMessage } from '@line/bot-sdk';
import express, { Application, Request, Response } from 'express';
import moment from 'moment';
import * as admin from 'firebase-admin'; // Firebase Imports
import { group } from 'console';
import axios, { AxiosResponse } from 'axios'

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

          // group message handler
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
          // eg: /schedule [city] [country]
          // eg: /schedule zhongli taiwan
          else if(command==='/schedule'){
            
            const city = textSplit[1];
            const country = textSplit[2];
            console.log(`get schedule for ${city}, ${country}`)

            //@ts-ignore
            const todaySchedule: Array<any> = await getPrayerScheduleToday(city, country)
            //@ts-ignore
            const timings:PrayerTimingsType = todaySchedule.timings;

            console.log(timings.Fajr)

            response = {
              type: 'text',
              text: 
                `Today Prayer Times for ${city},${country}\n`+
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


const GROUPS_EXAMPLE: Array<GroupItemsType> = [
  {
    id: "C048ee0720fddc0f9e107e6ffa7bc7f28",
    location: 'zhongli',
    country: 'taiwan',
    name: 'Musholla al mudhorot',
    isActive: true
  },
  {
    id: "Cdbd57fd622114d68bab8ec8a0062faef",
    location: 'malang',
    country: 'indonesia',
    name: 'Musholla al siswanto',
    isActive: true
  }
]

type GroupItemsType = {
  id: string;
  location: string;
  country: string;
  name?: string;
  isActive: boolean;
}

type PrayerTimingsType = {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}


type DailyReminderType = {
  id: number;
  groupId: string;
  location: string;
  schedules: Array<SchedulesType>;
}

type SchedulesType = {
  name: 'fajr' | 'duhr' | 'asr' | 'maghrib' | 'isha' | string;
  time: number;
}

const PRAYER_TIME_NAMES = [
  'fajr', 'duhr' , 'asr', 'maghrib', 'isha'
]

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

app.get('/test', async (req: Request, res: Response): Promise<Response> =>{

  let response:TextMessage;

  const groupId = "C048ee0720fddc0f9e107e6ffa7bc7f28"

  // @ts-ignore
  const getGroupData = await db.collection("Groups").doc(groupId).get().then( returnData =>{
    if (returnData.exists){
      // @ts-ignore
      var groupName = returnData.data().groupName
      // @ts-ignore
      var location = returnData.data().location

      // Create a new message.
      const res: TextMessage = {
        type: 'text',
        text: `${groupName} ${location}`,
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
    client.pushMessage(groupId, response)
  })
  
  return res.status(200).json({
    status: 'success',
    response: 'jancok'
  });
})

app.get('/test-api-new', async (req: Request, res: Response): Promise<Response> =>{

  //@ts-ignore
  const response: Array<any> = await getPrayerScheduleTodayNew('taipei')
  //@ts-ignore
  // const timings = response

  return res.status(200).json({
    status: 'success',
    response
  });
})

// Get API Aladhan
const getPrayerScheduleToday = async (city: string, country: string) => {

  let prayerTimeData: AxiosResponse<any>;
  let today = moment().get('date') - 1 // date to array index 

  return axios.get("http://api.aladhan.com/v1/calendarByCity", {
    params: {
      city: city,
      country: country,
      method: 2,
      month: moment().month() + 1,
      year: moment().year()
    }
  })
  .then(function (response) {
    prayerTimeData = response.data.data
  })
  .catch(function (error) {
    console.log(error);
  })
  .then(function () {
    // console.log(prayerTimeData);
    //@ts-ignore
    return prayerTimeData[today];
  }); 
}

const startReminder = (prayerName: string, timeValue: number, groupId: string, location: string) => {

  const response: TextMessage = {
    type: 'text',
    text: `It's time to ${prayerName.toUpperCase()} in ${location.toUpperCase()}, Time : ${new Date(timeValue * 1000)}`
  };

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
    console.log(response)
    console.log(replyToken)
    client.replyMessage(replyToken, response)
  }).catch(err => {
      console.log('error get group data')
      console.log(err)
  })
}

// Get API Pray Zone
const getPrayerScheduleTodayNew = async (city: string) => {

  let prayerTimeData: AxiosResponse<any>;

  prayerTimeData = await axios.get("https://api.pray.zone/v2/times/today.json", {
    params: {
      city: city,
    }
  })

  console.log(prayerTimeData);

  // return axios.get("https://api.pray.zone/v2/times/today.json", {
  //   params: {
  //     city: city,
  //   }
  // })
  // .then(function (response) {
  //   prayerTimeData = response
  // })
  // .catch(function (error) {
  //   console.log(error);
  // })
  // .then(function () {
  //   console.log(prayerTimeData);
  //   // //@ts-ignore
  //   return prayerTimeData;
  // }); 
}

const registerNewGroup = async (groupItem: GroupItemsType) => {
  return await db.collection('Groups').doc(groupItem.id).set(groupItem);
}

// Create a server and listen to it.
app.listen(PORT, () => {
  console.log(`Application is live and listening on port ${PORT}`);
});
