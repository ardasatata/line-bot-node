// Import all dependencies, mostly using destructuring for better view.
import { ClientConfig, Client, middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase, TextEventMessage } from '@line/bot-sdk';
import express, { Application, Request, Response } from 'express';
import moment from 'moment';

const schedule = require('node-schedule');

// Create a new Express application.
const app: Application = express();

const PORT = process.env.PORT || 3000;

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
app.use(middleware(middlewareConfig));

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
          await textEventHandler(event);
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


const GROUP_LIST = [
  'C048ee0720fddc0f9e107e6ffa7bc7f28',
  'Cdbd57fd622114d68bab8ec8a0062faef'
]

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

  console.log(now)

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

    // item.schedules.map((item)=>{
    //   console.log(new Date(item.time * 1000))
    //   startReminder(item.name, item.time, groupId, location)
    // })

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

const startReminder = (name: string, timeValue: number, groupId: string, location: string) => {

  const response: TextMessage = {
    type: 'text',
    text: `It's time to ${name.toUpperCase()} in ${location.toUpperCase()}, Time : ${new Date(timeValue * 1000)}`
  };

  const job = schedule.scheduleJob(new Date(timeValue * 1000), 
        async function(){
          await client.pushMessage(groupId, response)
          await console.log(response);
      });
}

// Create a server and listen to it.
app.listen(PORT, () => {
  console.log(`Application is live and listening on port ${PORT}`);
});
