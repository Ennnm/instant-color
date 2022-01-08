# Technical Review

### "Technical" refers to software logic and syntax.

##### What went well? Please share a link to the specific code.

- modularising of image-card in its own ejs
- reuse of posts-in-categories ejs for index page and home page
- the end result of the colors

##### What were the biggest challenges you faced? Please share a link to the specific code.

- saving downsized image, linking to image from ejs  
  (the image is only accessible on the first level http://localhost:3004/some.jpg not on http://localhost:3004/sublevel/some.jpg
  
  > use filename not relative file path
  
- accessing colord apis through on ejs for color manipulation of html elements (found workaround)

  > #FFFFFF10

- figuring out how to copy color codes on click. Copied code from internet, not sure how it works (image-card.ejs line 2-10)

- modifying bootstrap dynamic element for tooltips (image-card.ejs line 12-line 14. is this jquery?)

- linking to items in nested objects. Got to be careful on what is going into res.render('ejs fie', objectOfConcern)

- nested queries in for loop ( index.js addImgToCategoryObj function line 453 to 475. How best/alternate ways of doing this )
	
	>select with category name and modify later after await
	>way to do await with loops
	>use await with promise all
	
- extremely long pool.query.then chain (index.js userHandler function line 523 to 578). What is best practice, how should it be
  refactored?
  
  > break into multi async await functions
  
- quite dependent on Promise.all([imagesQueries]) to return image objects. As promises are asnc, if the back promises 
  completed before the first ones, are they returned earlier in the result object and end up ealier in the result array?
  if so how to ensure that we get what we want.double checking?

  > yes results are returned in the same order as they are promised
  
- fixing bugs. Code is long and disorganised. Hard to track the line in code where console.log/console.error happened.
  How to manage when using multiple .mjs 
  
  > be more careful using console.log, console.error returns error with lines. is ok
  >
  > consider debugger https://bootcamp.rocketacademy.co/0-language-and-tooling/0.9-node-debugger
  
- using query.then chain to add on to renderObject (index.js getColorsFromImgId line 233-285). is this convention for 
  working with promise chains and res.render?  
  
  > yes
  
- formulating a way to match and calculate the differences between the base color with the harmony palettes. 

##### What would you do differently next time?

- don't know. I always deviate from initial plans when I feel like it.
- plan wireframes for desktop mode rather than mobile

### Process Review

##### "Process" refers to app development steps and strategy.

- idea -> basic wireframes, userflow, erd -> working with colors api + processing of results -> userflow & wireframe on figma (overdesigned wrt final)
  -> main app

- Final app is different from orginal erd and wireframe design after improved understanding of color and what is more interesting/
  possible to do in the given time.

- development felt sort of chaotic because I was changing priorities as I go, working on stuff I find interesting at that moment.
- As app is visually important. testing means having to look at ejs and js code at the same time. Easily distracted from working on 
  js and ejs. Sometimes losing track of what i want to do on the js after jumping to work on the ejs.
- Building of routes, user auth not prioritised, only continued after some routes (index, renderPicture) were better fleshed out.
  Felt behind wrt mvp because of ^
  

##### What went well?

- Despite mvp missing lots of features and routes. The app was eventually done \o/

##### What could have been better?

- feels like chaotic development works as its more iterative compared keeping to a plan.
  However keeping to plan may keep it better managed.
  

##### What would you do differently next time?

- somethings that were not highlights of the app was part of the mvp and done first while others that turned
  out to be more interesting was only done/thought of later. If I knew in the beginning which features would 
  end up to be better, I could *prioritize* them first.

