
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Loading } from 'react-simple-chatbot';
import callTranslate from './translate_de_to_en';
import language_parameters from './language_setting';

import Speech from 'speak-tts'

const speech = new Speech()
require('dotenv').config()


const { Configuration, OpenAIApi } = require("openai");
const neo4j = require('neo4j-driver')

const driver = neo4j.driver(process.env.REACT_APP_NEO4JURI, neo4j.auth.basic(process.env.REACT_APP_NEO4JUSER, process.env.REACT_APP_NEO4JPASSWORD))
const target_language = process.env.REACT_APP_LANGUAGE


//const target_language = "Chinese"
//const target_language = "English"


//const target_language = "Japanese"
const lang_p = language_parameters(target_language)

const session = driver.session()

const configuration = new Configuration({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

speech.init({
  'volume': 1,
  //'lang': 'en-GB',
  //'lang': 'de-DE',
  'lang': lang_p['lang'],
  'rate': 1,
  'pitch': 1,
  'voice': lang_p['voice'],
  'splitSentences': true,
  'listeners': {
    'onvoiceschanged': (voices) => {
      console.log("Event voices changed", voices)
    }
  }
})

class DoctorAI extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: true,
      result: ''
    };

    this.triggetNext = this.triggetNext.bind(this);
  }

  callDoctorAI() {

    const self = this;
    const { steps } = this.props;
    const search_raw = steps.user.value.trim();

    async function callAsync() {
      let training = `
#How often does each drug cure Viral sinusitis?
MATCH (dr:Drug)<-[:HAS_DRUG]-(e)-[:HAS_CONDITION]-> (c:Condition), (e)-[:HAS_END]->(e2) WHERE toLower(c.description) CONTAINS toLower("Viral sinusitis") RETURN  dr.description, COUNT(dr.description) LIMIT 100

#How often does each drug cure Fibromyalgia?
MATCH (dr:Drug)<-[:HAS_DRUG]-(e)-[:HAS_CONDITION]-> (c:Condition), (e)-[:HAS_END]->(e2) WHERE toLower(c.description) CONTAINS toLower("Fibromyalgia") RETURN  dr.description, COUNT(dr.description) LIMIT 100

#Tell me the address of BERKSHIRE MEDICAL CENTER INC - 1
MATCH (o:Organization) -[:HAS_ADDRESS]-> (a:Address) WHERE toLower(o.name) = toLower("BERKSHIRE MEDICAL CENTER INC - 1") RETURN a.address

#Tell me the address of Doctor Ashlyn643 Walker122
MATCH (pr:Provider) -[:HAS_ADDRESS]-> (a:Address) WHERE pr.name = "Ashlyn643 Walker122" RETURN a.address

#How often does each doctor cure COVID-19?
MATCH (pr:Provider)<-[]-(e)-[]-> (c:Condition), (e)-[:HAS_END]->(e2) WHERE toLower(c.description) CONTAINS toLower("COVID-19") RETURN DISTINCT pr.name, COUNT(pr) AS count_pr ORDER BY count_pr DESC

#How ofter does each hospital cure COVIV-19?
MATCH (o:Organization)<-[]-(e)-[]-> (c:Condition), (e)-[:HAS_END]->(e2) WHERE toLower(c.description) CONTAINS toLower("COVID-19") RETURN DISTINCT o.name, COUNT(o) AS count_o ORDER BY count_o DESC

#Break down the number of COVID-19 patients per race.
MATCH p=(pa:Patient)-[:HAS_ENCOUNTER]->(e)-[:HAS_CONDITION]-> (c:Condition) WHERE toLower(c.description) CONTAINS toLower("COVID-19") RETURN DISTINCT pa.race, COUNT(pa.race) AS count_race ORDER BY count_race DESC

#Break down the number of COVID-19 patients per ethnicity.
MATCH p=(pa:Patient)-[:HAS_ENCOUNTER]->(e)-[:HAS_CONDITION]-> (c:Condition) WHERE toLower(c.description) CONTAINS toLower("COVID-19") RETURN DISTINCT pa.ethnicity, COUNT(pa.ethnicity) AS count_ethnicity ORDER BY count_ethnicity DESC

#Break down the number of COVID-19 patients per gender.
MATCH p=(pa:Patient)-[:HAS_ENCOUNTER]->(e)-[:HAS_CONDITION]-> (c:Condition) WHERE toLower(c.description) CONTAINS toLower("COVID-19") RETURN DISTINCT pa.gender, COUNT(pa.gender) AS count_gender ORDER BY count_gender DESC


#`;
      let search = search_raw;

      if (lang_p['target_language'] !== "English")
      {
        search = await callTranslate("Translate this " + lang_p['target_language'] + " into English\n\n" + search_raw);
      }
      

      //let search = "Tell me something about the disease called COVID-19?";

      let query = training + search.trim() + "\n"

      let textToSpeak = ''
      try {
        console.log("query", query)
        if (search) {

          const response = await openai.createCompletion("davinci", {
            prompt: query,
            temperature: 0,
            max_tokens: 300,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            stop: ["#", ";"],
          });

          console.log('response:', response);
          let cypher = response.data.choices[0].text;
          console.log('Doctor AI:' + cypher);

          try {
            const result = await session.run(cypher)

            //const singleRecord = result.records[0]

            const records = result.records

            records.forEach(element => {
              textToSpeak += element.get(0) + ", "
            });

            //textToSpeak = singleRecord.get(0)
            textToSpeak = textToSpeak.slice(0, -2).trim()
            console.log("before translation " + "Translate this into " + lang_p['target_language'] + "\n\n" + textToSpeak)
            if (lang_p['target_language'] !== "English")
            {
              textToSpeak = await callTranslate("Translate this into " + lang_p['target_language'] + "\n\n" + textToSpeak);
            }
            
            textToSpeak = textToSpeak.trim()
            console.log("after translation " + textToSpeak)

          } finally {
            //await session.close()
          }

          // on application exit:
          //await driver.close()
        }
      }
      catch (error) {
        //console.log(process.env);
        console.error(error)
        console.log('Doctor AI:' + textToSpeak);
        //textToSpeak = "Sorry I can't answer that. Could you please try again?"
        textToSpeak = lang_p['fallback_utterance']
      }



      self.setState({ loading: false, result: textToSpeak });

      if (textToSpeak.length > 115) {
        //speech.speak({ text: "Please find the information below" })
        speech.speak({ text: lang_p['look_utterance'] })
          .then(() => { console.log("Success !") })
          .catch(e => { console.error("An error occurred :", e) })
      } else {
        speech.speak({ text: textToSpeak })
          .then(() => { console.log("Success: " + textToSpeak) })
          .catch(e => { console.error("An error occurred :", e) })
      }

    }
    callAsync();
  }

  triggetNext() {
    this.setState({}, () => {
      this.props.triggerNextStep();
    });
  }

  componentDidMount() {
    this.callDoctorAI();
    this.triggetNext();
  }

  render() {
    const { loading, result } = this.state;
    const lines = result.split("\n");
    const elements = [];
    for (const [index, value] of lines.entries()) {
      elements.push(<span key={index}>{value}<br /></span>)
    }

    return (
      <div className="bot-response">
        {loading ? <Loading /> : elements}
      </div>
    );
  }
}

DoctorAI.propTypes = {
  steps: PropTypes.object,
  triggerNextStep: PropTypes.func,
};

DoctorAI.defaultProps = {
  steps: undefined,
  triggerNextStep: undefined,
};

export default DoctorAI;
