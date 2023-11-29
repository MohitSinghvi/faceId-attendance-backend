const express = require("express");
const app = express();
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
const short = require("short-uuid");

const cors = require("cors");

const multer = require("multer");
const AWS = require("aws-sdk");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();


AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_REGION, // Change this to your desired AWS region
});

const s3 = new AWS.S3();

// Configure Multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

const https = require("https");



app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

app.use(cors());

const port = 8000;
app.listen(port, () => {
  console.log("Listening on port " + port);
});

app.get("/", (req, res) => res.send("My first Node API!"));

var mysql = require("mysql");

var con = mysql.createPool({
  connectionLimit : 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
})


AWS.config.update({ region: "us-east-1" });
const rekognition = new AWS.Rekognition();
app.use(bodyParser.json());

const generateRandomSecret = () => {
  return crypto.randomBytes(32).toString("hex");
};


const AmazonCognitoIdentity = require('amazon-cognito-identity-js');

const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });

// AWS Cognito configuration
const poolData = {
  UserPoolId: process.env.USER_POOL_ID,
  ClientId: process.env.CLIENT_ID,
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

const ses = new AWS.SES({ region: "us-east-1" });





app.post("/addStudent", (req, res) => {
  const collectionId = "cognitoCollectionGS";
  const { name, rollNo, course, batch, image, email } = req.body;
  // console.log(name, rollNo, course, batch, image);
  // Decode base64 image data
  const binaryImageData = Buffer.from(image, "base64");

  // Call the IndexFaces operation to add the face to the collection

  con.query(
    "insert into student values (?,?,?,?,?)",
    [rollNo, name, course, batch, email],
    function (err, result) {
      if (err)
        res.send(
          JSON.stringify({
            statusCode: 500,
            body: JSON.stringify(err),
          })
        );

      const params = {
        CollectionId: collectionId,
        Image: {
          Bytes: binaryImageData,
        },
        ExternalImageId: rollNo, // This can be an identifier for the image
        MaxFaces: 1,
        QualityFilter: "AUTO",
        DetectionAttributes: ["ALL"],
      };

      rekognition.indexFaces(params, (err, data) => {
        if (err) {
          console.error("Error adding image to collection:", err);
          res.status(500).json({ error: "Error adding image to collection" });
        } else {
                // const email = email;
      const password = 'password';
      const role = 'Student';

      const attributeList = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:role', Value: role }),
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:userId', Value: rollNo }),
      ];
    
      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }

        const adminConfirmParams = {
          UserPoolId: process.env.USER_POOL_ID,
          Username: email,
        };

        cognitoIdentityServiceProvider.adminConfirmSignUp(adminConfirmParams, (adminConfirmErr, adminConfirmData) => {
          if (adminConfirmErr) {
            console.error(adminConfirmErr);
            return res.status(200).json({ message: "Image added to collection", data });
            // return res.status(500).json({ error: adminConfirmErr.message });
          }
                  // Send confirmation email
          const params = {
            Destination: {
              ToAddresses: [email],
            },
            Message: {
              Body: {
                Text: {
                  Data: `Thank you for signing up! Your password is ${password}.`,
                },
              },
              Subject: {
                Data: 'Confirmation Email',
              },
            },
            Source: 'msinghvi16@gmail.com', // Replace with your verified email address in SES
          };
      
          ses.sendEmail(params, (emailErr, emailData) => {
            if (emailErr) {
              console.error(emailErr);
              // return res.status(500).json({ error: emailErr.message });
              return res.status(200).json({ message: "Signup Sucess, but email not sent", data });
            }
      
            res.json({
              message: 'Student successfully signed up. Confirmation email sent.',
              result,
              emailData,
            });
          });
        });
      });
          // console.log("Image added to collection:", data);
          // res.status(200).json({ message: "Image added to collection", data });
        }
      });

      // return res.status(200).json({ message: 'File uploaded successfully.'});
    }
  );
});

app.post("/mark-attendance", async (req, res) => {
  const collectionId = "cognitoCollectionGS";
  const { imageBytes, sessionId, courseId } = req.body;
  const faceMatchThreshold = 70;
  const id = uuidv4();

  const fetchSessionIsActive = new Promise((resolve, reject) => {
    con.query(
      `SELECT is_active FROM session WHERE sessionId = "${sessionId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result[0].is_active);
      }
    );
  });
  let sessionIsActive;
  try {
    sessionIsActive = await fetchSessionIsActive;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "error fetching from session rds in /mark-attendance api",
    });
  }
  if (!sessionIsActive) {
    return res.status(400).json({ message: "session inactive" });
  }

  const params = {
    CollectionId: collectionId,
    Image: {
      Bytes: Buffer.from(imageBytes, "base64"),
    },
    FaceMatchThreshold: faceMatchThreshold,
    MaxFaces: 1,
  };

  rekognition.searchFacesByImage(params, async (err, data) => {
    if (err) {
      res
        .status(500)
        .json({ error: "Error searching for faces in collection" });
    } else {
      if (data?.FaceMatches?.length > 0) {
        const studentId = data?.FaceMatches[0]?.Face?.ExternalImageId;

        const fetchIsEnrolled = new Promise((resolve, reject) => {
          con.query(
            `SELECT COUNT(*) as count FROM enroll WHERE studentId = "${studentId}" and courseId = "${courseId}"`,
            (err, result) => {
              if (err) {
                return reject(err);
              }
              return resolve(result[0].count === 1);
            }
          );
        });

        try {
          const isEnrolled = await fetchIsEnrolled;
          if (!isEnrolled) {
            return res
              .status(400)
              .json({ message: "The student is not enrolled in this course" });
          }
        } catch (err) {
          return res.status(500).json({
            ...err,
            message: "could not fetch data from enroll table",
          });
        }

        con.query(
          "insert into attendance values (?,?,?)",
          [id, sessionId, data?.FaceMatches[0]?.Face?.ExternalImageId],
          function (err, result) {
            if (err)
              res.send(
                JSON.stringify({
                  statusCode: 500,
                  body: JSON.stringify(err),
                })
              );
            res.status(200).json({
              message: "Attendance Marked",
              rollNo: data?.FaceMatches[0]?.Face?.ExternalImageId,
            });
          }
        );
      } else {
        res.status(500).json({ message: "Attendance Not Marked" });
      }
    }
  });
});

app.get("/students", (req, res) => {
  var appendString = "";
  if (req.query.rollNo) {
    appendString = ' where rollNo = "' + req.query.rollNo + '"';
  }
  con.query("SELECT * from student" + appendString, function (err, result) {
    if (err) throw err;
    return res.status(200).json({ body: result });
  });
});

app.post("/add-course", async (req, res) => {
  const { name, code, description, professorId, term } = req.body;

  con.query(
    "insert into course values (?,?,?,?,?)",
    [code, name, description, professorId, term],
    function (err, result) {
      if (err) {
        return res.status(500).json({
          ...err,
          message: "error inserting courses in add-course api",
        });
      }
      return res.status(200).json({ code, message: "add course successful!" });
    }
  );
});

app.post("/course/enroll-students", async (req, res) => {
  const { courseId } = req.query;
  const { studentIds } = req.body;

  if (!studentIds?.length) {
    return res.status(404).json({ message: "studentIds not provided" });
  }

  let studentIdList = "(" + studentIds[0];
  for (let i = 1; i < studentIds.length; ++i) {
    studentIdList += ", ";
    studentIdList += studentIds[i];
  }
  studentIdList += ")";
  console.log("studentIdList", studentIdList);

  const checkForInvalidStudents = new Promise((resolve, reject) => {
    con.query(
      "SELECT COUNT(*) as count FROM student WHERE rollNo IN " + studentIdList,
      function (err, result) {
        if (err) {
          return reject(err);
        }
        return resolve(result[0].count);
      }
    );
  });

  try {
    const validStudentCount = await checkForInvalidStudents;
    console.log("validStudentCount", validStudentCount);
    if (validStudentCount !== studentIds.length) {
      return res.status(404).json({ message: "Invalid Students" });
    }
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "error fetching from rds in /course/enroll-students api",
    });
  }

  Promise.all(
    studentIds.map((studentId) => {
      return new Promise((resolve, reject) => {
        con.query(
          "insert into enroll values (?,?)",
          [studentId, courseId],
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve();
          }
        );
      });
    })
  )
    .then(() => {
      return res.status(200).json({ message: "enrollment success" });
    })
    .catch((err) => {
      return res.status(500).json({
        ...err,
        message: "error inserting into rds - course/enroll-students api",
      });
    });
});

app.get("/courses", async (req, res) => {

  const { professorId, studentId } = req.query;
  let appendString = "";
  if(professorId){
    appendString = "where professorId = '"+ professorId+"'";
  }

  if(studentId) {
    appendString = " c, enroll e where c.id = e.courseId and e.studentId = "+ studentId
  }

  con.query("SELECT * FROM course "+ appendString, (err, result) => {
    if (err) {
      return res.status(500).json({
        ...err,
        message: "error fetching courses from rds",
      });
    }
    console.log("result", result);
    const courseList = result.map((course) => {
      return {
        name: course.name,
        code: course.id,
        description: course.info,
        professorId: course.professorId,
        term: course.term,
      };
    });
    return res.status(200).json(courseList);
  });
});

app.post("/add-professor", async (req, res) => {
  const { name, description, email } = req.body;
  const id = short.generate();
  con.query(
    "insert into professor values (?,?,?,?)",
    [id, name, email, description],
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error adding professor to the rds" });
      }

      // const email = email;
      const password = short.generate();
      const role = 'Professor';



      const attributeList = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:role', Value: role }),
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:userId', Value: id }),
      ];
    
      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }


        const adminConfirmParams = {
          UserPoolId: process.env.USER_POOL_ID,
          Username: email,
        };



        cognitoIdentityServiceProvider.adminConfirmSignUp(adminConfirmParams, (adminConfirmErr, adminConfirmData) => {
          if (adminConfirmErr) {
            console.error(adminConfirmErr);
            return res.status(500).json({ error: adminConfirmErr.message });
          }
                  // Send confirmation email
          const params = {
            Destination: {
              ToAddresses: [email],
            },
            Message: {
              Body: {
                Text: {
                  Data: `Thank you for signing up! Your password is ${password}.`,
                },
              },
              Subject: {
                Data: 'Confirmation Email',
              },
            },
            Source: 'msinghvi16@gmail.com', // Replace with your verified email address in SES
          };
      
          ses.sendEmail(params, (emailErr, emailData) => {
            if (emailErr) {
              console.error(emailErr);
              return res.status(500).json({ error: emailErr.message });
            }
      
            res.json({
              message: 'Professor successfully signed up. Confirmation email sent.',
              result,
              emailData,
            });
          });
        });
      });



      
      // return res.status(200).json({ message: "add professor successful!" });
    }
  );
});

app.get("/professors", async (req, res) => {
  con.query("SELECT * FROM professor", (err, result) => {
    if (err) {
      return res.status(500).json({
        ...err,
        message: "error fetching professors from rds",
      });
    }
    console.log("result-professors", result);
    const professorList = result.map((professor) => {
      return {
        name: professor.name,
        id: professor.id,
        description: professor.info,
        email: professor.email,
      };
    });
    return res.status(200).json(professorList);
  });
});

app.post("/create-session", async (req, res) => {
  const { courseId, timeStamp } = req.body;
  const sessionId = short.generate();
  con.query(
    "insert into session values (?,?,?,?,?)",
    [sessionId, courseId, null, new Date(), true],
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error inserting session to rds" });
      }
      return res.status(200).json({
        courseId,
        sessionId: sessionId,
        message: "session creation successful!",
      });
    }
  );
});

app.get("/sessions", async (req, res) => {
  const { courseId } = req.query;

  const fetchCourseInfo = new Promise((resolve, reject) => {
    con.query(
      `SELECT id, name, professorId FROM course WHERE id="${courseId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        console.log("result", result);
        const course = {
          courseName: result[0].name,
          professorId: result[0].professorId,
        };
        return resolve(course);
      }
    );
  });

  let courseInfo = { courseId };
  try {
    const temp = await fetchCourseInfo;
    courseInfo = { ...courseInfo, ...temp };
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch course info - sessions-get-api",
    });
  }

  const fetchProfessorName = new Promise((resolve, reject) => {
    con.query(
      `SELECT name FROM professor WHERE id = "${courseInfo.professorId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        console.log("result", result);
        const professorName = result[0].name;
        return resolve(professorName);
      }
    );
  });

  try {
    const temp = await fetchProfessorName;
    courseInfo = { ...courseInfo, professor: temp };
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch professor name - sessions-get-api",
    });
  }

  const sessions = [];
  con.query(
    `SELECT sessionTimeStamp, sessionId FROM session WHERE courseId = "${courseId}"`,
    (err, result) => {
      if (err) {
        return res.status(500).json({
          ...err,
          message: "failed to fetch sessionTimeStamp - session-get-api",
        });
      }
      console.log("result", result);
      const sessions = result.map((item) => {
        return { ...courseInfo, timeStamp: item.sessionTimeStamp, sessionId: item.sessionId };
      });
      return res.status(200).json(sessions);
    }
  );
});

app.get("/attendances", async (req, res) => {
  const { courseId, rollNo } = req.query;

  const fetchCourses = new Promise((resolve, reject) => {
    con.query(`SELECT id, name from course`, (err, result) => {
      if (err) {
        return reject(err);
      }
      const courses = result.map((item) => {
        return { courseId: item.id, courseName: item.name };
      });
      return resolve(courses);
    });
  });
  let courses;
  try {
    courses = await fetchCourses;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch data from course rds - attendances-get-api",
    });
  }

  const fetchStudents = new Promise((resolve, reject) => {
    con.query(`SELECT rollNo, name FROM student`, (err, result) => {
      if (err) {
        return reject(err);
      }
      const students = result.map((item) => {
        return { rollNo: item.rollNo, name: item.name };
      });
      return resolve(students);
    });
  });
  let students;
  try {
    students = await fetchStudents;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch data from student rds - attendances-get-api",
    });
  }

  if (courseId) {
    for (const c in courses) {
      const course = courses[c];
      if (course.courseId === courseId) {
        courses = [course];
        break;
      }
    }
  }

  if (rollNo) {
    for (const s in students) {
      const student = students[s];
      if (student.rollNo === rollNo) {
        students = [student];
        break;
      }
    }
  }

  const fetchSessions = new Promise((resolve, reject) => {
    con.query(`SELECT sessionId, courseId FROM session`, (err, result) => {
      if (err) {
        return reject(err);
      }
      const sessions = result.map((item) => {
        return { sessionId: item.sessionId, courseId: item.courseId };
      });
      return resolve(sessions);
    });
  });
  let sessions;
  try {
    sessions = await fetchSessions;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch data from session rds - attendances-get-api",
    });
  }

  const sessionsByCourseId = {};
  for (const c in courses) {
    const course = courses[c];
    sessionsByCourseId[course.courseId] = [];
  }
  for (const s in sessions) {
    const session = sessions[s];
    sessionsByCourseId[session.courseId].push(session.sessionId);
  }

  const fetchAttendance = new Promise((resolve, reject) => {
    con.query(`SELECT sessionId, studentId FROM attendance`, (err, result) => {
      if (err) {
        return reject(err);
      }
      const attendance = result.map((item) => {
        return { sessionId: item.sessionId, studentId: item.studentId };
      });
      return resolve(attendance);
    });
  });
  let attendance;
  try {
    attendance = await fetchAttendance;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch data from attendance rds - attendances-get-api",
    });
  }

  const fetchEnroll = new Promise((resolve, reject) => {
    con.query(`SELECT studentId, courseId FROM enroll`, (err, result) => {
      if (err) {
        return reject(err);
      }
      const enrollData = result.map((item) => {
        return { studentId: item.studentId, courseId: item.courseId };
      });
      return resolve(enrollData);
    });
  });
  let enrollData;
  try {
    enrollData = await fetchEnroll;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch data from enroll rds - attendances-get-api",
    });
  }

  const info = [];
  for (const s in students) {
    const student = students[s];
    for (const c in courses) {
      const course = courses[c];
      let found = false;
      for (const d in enrollData) {
        const data = enrollData[d];
        if (
          data.studentId === student.rollNo &&
          data.courseId === course.courseId
        ) {
          found = true;
          break;
        }
      }
      const data = {
        rollNo: student.rollNo,
        studentName: student.name,
        courseId: course.courseId,
        courseName: course.courseName,
      };
      if (!found) {
        data.percentageAttendance = "not enrolled";
      } else if (!sessionsByCourseId[course.courseId]?.length) {
        data.percentageAttendance = "this course did not have any session";
      } else {
        let cnt = 0;
        for (const ss in sessionsByCourseId[course.courseId]) {
          const sessionId = sessionsByCourseId[course.courseId][ss];
          for (const attendanceInfo_ in attendance) {
            const attendanceInfo = attendance[attendanceInfo_];
            if (
              attendanceInfo.sessionId === sessionId &&
              attendanceInfo.studentId === student
            ) {
              ++cnt;
              break;
            }
          }
        }
        data.percentageAttendance =
          cnt / sessionsByCourseId[course.courseId].length;
      }
      info.push(data);
    }
  }

  return res.status(200).json(info);
});

app.get("/attendances/session", async (req, res) => {
  const { sessionId } = req.query;

  const fetchCourseId = new Promise((resolve, reject) => {
    con.query(
      `SELECT courseId FROM session WHERE sessionId = "${sessionId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result[0].courseId);
      }
    );
  });

  let courseId;
  try {
    courseId = await fetchCourseId;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from session rds - attendances/session-api",
    });
  }

  const fetchEnrolledStudentIds = new Promise((resolve, reject) => {
    con.query(
      `SELECT studentId FROM enroll WHERE courseId = "${courseId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const studentIds = result.map((item) => item.studentId);
        return resolve(studentIds);
      }
    );
  });
  let studentIds;
  try {
    studentIds = await fetchEnrolledStudentIds;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from enroll rds - attendances/session-api",
    });
  }

  if (!studentIds?.length) {
    return res.status(400).json({
      message: "no student enrolled in the course of this session",
    });
  }

  const fetchStudents = new Promise((resolve, reject) => {
    let studentIdList = "(" + studentIds[0];
    for (let i = 1; i < studentIds.length; ++i) {
      studentIdList += ", ";
      studentIdList += studentIds[i];
    }
    studentIdList += ")";
    console.log(studentIdList);
    con.query(
      `SELECT rollNo, name FROM student WHERE rollNo IN ${studentIdList}`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const students = result.map((item) => {
          return { rollNo: item.rollNo, name: item.name };
        });
        return resolve(students);
      }
    );
  });
  let students;
  try {
    students = await fetchStudents;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from student rds - attendances/session-api",
    });
  }

  const fetchAttendance = new Promise((resolve, reject) => {
    con.query(
      `SELECT studentId FROM attendance WHERE sessionId="${sessionId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const presentStudents = result.map((item) => item.studentId);
        return resolve(presentStudents);
      }
    );
  });
  let presentStudents;
  try {
    presentStudents = await fetchAttendance;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from attendance rds - attendances/session-api",
    });
  }

  const info = [];
  console.log("ASDASD", presentStudents);
  console.log("SADASDSA", students);
  for (let i = 0; i < students.length; ++i) {
    const studentData = {
      rollNo: students[i].rollNo,
      studentName: students[i].name,
    };
    let isPresent = false;
    for (let j = 0; j < presentStudents.length; ++j) {
      if (studentData.rollNo === presentStudents[j]) {
        isPresent = true;
        break;
      }
    }
    info.push({ ...studentData, present: isPresent });
  }

  return res.status(200).json(info);
});

app.get("/session", async (req, res) => {
  const { sessionId } = req.query;

  const fetchSessionData = new Promise((resolve, reject) => {
    con.query(
      `SELECT sessionId, courseId, sessionTimeStamp, is_active FROM session WHERE sessionId="${sessionId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const sessionData = {
          sessionId,
          courseId: result[0].courseId,
          sessionTimeStamp: result[0].sessionTimeStamp,
          is_active: result[0].is_active,
        };
        return resolve(sessionData);
      }
    );
  });

  let sessionData;
  try {
    sessionData = await fetchSessionData;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from session rds - session-get-api",
    });
  }

  const fetchCourse = new Promise((resolve, reject) => {
    con.query(
      `SELECT name, professorId FROM course WHERE id="${sessionData.courseId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        const course = {
          name: result[0].name,
          professorId: result[0].professorId,
        };
        return resolve(course);
      }
    );
  });
  let course;
  try {
    course = await fetchCourse;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from course rds - session-get-api",
    });
  }

  const fetchProfessorName = new Promise((resolve, reject) => {
    con.query(
      `SELECT name FROM professor WHERE id="${course.professorId}"`,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result[0].name);
      }
    );
  });
  let professorName;
  try {
    professorName = await fetchProfessorName;
  } catch (err) {
    return res.status(500).json({
      ...err,
      message: "could not fetch from professor rds - session-get-api",
    });
  }

  const info = {
    courseId: sessionData.courseId,
    courseName: course.name,
    professor: professorName,
    timeStamp: sessionData.sessionTimeStamp,
    is_active: Boolean(sessionData.is_active),
  };
});

app.post("/end-session", async (req, res) => {
  const { sessionId } = req.query;
  con.query(
    `UPDATE session SET is_active = 0 WHERE sessionId="${sessionId}"`,
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "could not insert to the database" });
      }
      return res.status(200).json({ message: "session end success" });
    }
  );
});

app.get("/student", async (req, res) => {
  const { rollNo } = req.query;
  con.query(
    `SELECT * FROM student WHERE rollNo = "${rollNo}"`,
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error fetching from rds" });
      }
      if (!result?.length) {
        return res.status(404).json({ message: "not found" });
      }
      const data = {
        rollNo: result[0].rollNo,
        name: result[0].name,
        course: result[0].course,
        batch: result[0].batch,
        email: result[0].email,
      };
      return res.status(200).json(data);
    }
  );
});

app.get("/professor", async (req, res) => {
  const { professorId } = req.query;
  con.query(
    `SELECT * FROM professor WHERE id = "${professorId}"`,
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error fetching from rds" });
      }
      if (!result?.length) {
        return res.status(404).json({ message: "not found" });
      }
      const data = {
        id: result[0].id,
        name: result[0].name,
        email: result[0].email,
        info: result[0].info,
      };
      return res.status(200).json(data);
    }
  );
});

app.get("/course", async (req, res) => {
  const { courseId } = req.query;
  con.query(`SELECT * FROM course WHERE id="${courseId}"`, (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ ...err, message: "error fetching from rds" });
    }
    if (!result?.length) {
      return res.status(404).json({ message: "not found" });
    }
    const data = {
      id: result[0].id,
      name: result[0].name,
      professorId: result[0].professorId,
      info: result[0].info,
      term: result[0].term,
    };
    return res.status(200).json(data);
  });
});


app.get("/courseAttendance", (req, res) => {
  let courseId = req.query?.courseId;
  query = `SELECT
  s.rollNo AS studentId,
  s.name AS name,
  COUNT(a.sessionId) * 100.0 / COUNT(DISTINCT se.sessionId) AS percentageAttendance
FROM
  student s
JOIN
  enroll e ON s.rollNo = e.studentId
JOIN
  session se ON e.courseId = se.courseId
LEFT JOIN
  attendance a ON se.sessionId = a.sessionId AND s.rollNo = a.studentId
WHERE
  e.courseId = ?
GROUP BY
  s.rollNo, s.name
ORDER BY
  percentageAttendance DESC;
`
  con.query(query,[courseId], function (err, result) {
    if (err) throw err;
    return res.status(200).json({ body: result });
  });
});


app.get("/studentAttendance", (req, res) => {
  let studentId = req.query?.studentId;
  query = `SELECT
  c.id AS courseId,
  c.name AS courseName,
  COUNT(DISTINCT a.sessionId) * 100.0 / COUNT(DISTINCT s.sessionId) AS percentageAttendance
FROM
  course c
JOIN
  enroll e ON c.id = e.courseId
LEFT JOIN
  session s ON c.id = s.courseId
LEFT JOIN
  attendance a ON s.sessionId = a.sessionId AND e.studentId = a.studentId
WHERE
  e.studentId = ?
GROUP BY
  c.id, c.name
ORDER BY
  c.id;
`
  con.query(query,[studentId], function (err, result) {
    if (err) throw err;
    return res.status(200).json({ body: result });
  });
});


app.post('/login', (req, res) => {
  const { email, password } = req.body;

  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: email,
    Password: password,
  });

  const userData = {
    Username: email,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (session) => {

      cognitoUser.getUserAttributes((err, attributes) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }

        const userRoleAttribute = attributes.find(attr => attr.getName() === 'custom:role');
        const userIdAttribute = attributes.find(attr => attr.getName() === 'custom:userId');
        const userRole = userRoleAttribute ? userRoleAttribute.getValue() : 'unknown';
        const userId = userIdAttribute ? userIdAttribute.getValue() : 'unknown';
        res.json({
          message: 'User successfully logged in',
          accessToken: session.getAccessToken().getJwtToken(),
          role: userRole,
          id: userId
        });
      });
    },
    onFailure: (err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    },
  });
});

app.post('/change-password', (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
    Username: email,
    Password: oldPassword,
  });

  const userData = {
    Username: email,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: () => {
      cognitoUser.changePassword(oldPassword, newPassword, (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Password successfully changed', result });
      });
    },
    onFailure: (err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    },
  });
});


app.post('/logout', (req, res) => {
  const { email } = req.body;

  const userData = {
    Username: email,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  if (cognitoUser) {
    cognitoUser.signOut();
    res.json({ message: 'User successfully logged out' });
  } else {
    res.status(400).json({ error: 'User not found' });
  }
});