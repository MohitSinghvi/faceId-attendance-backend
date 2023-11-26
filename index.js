const express = require("express");
const app = express();
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
const short = require("short-uuid");

const cors = require("cors");

const multer = require("multer");
const AWS = require("aws-sdk");

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

require("dotenv").config();

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
var con = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

AWS.config.update({ region: "us-east-1" });
const rekognition = new AWS.Rekognition();
app.use(bodyParser.json());

app.post("/addStudent", (req, res) => {
  const collectionId = "cognitoCollectionGS";
  const { name, rollNo, course, batch, image } = req.body;

  // Decode base64 image data
  const binaryImageData = Buffer.from(image, "base64");

  // Call the IndexFaces operation to add the face to the collection

  con.query(
    "insert into student values (?,?,?,?)",
    [rollNo, name, course, batch],
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
          console.log("Image added to collection:", data);
          res.status(200).json({ message: "Image added to collection", data });
        }
      });

      // return res.status(200).json({ message: 'File uploaded successfully.'});
    }
  );
});

app.post("/mark-attendance", (req, res) => {
  const collectionId = "cognitoCollectionGS";
  const imageBytes = req.body.imageBytes;
  const sessionId = req.body.sessionId;
  const faceMatchThreshold = 70;
  const id = uuidv4();

  const params = {
    CollectionId: collectionId,
    Image: {
      Bytes: Buffer.from(imageBytes, "base64"),
    },
    FaceMatchThreshold: faceMatchThreshold,
    MaxFaces: 1,
  };

  rekognition.searchFacesByImage(params, (err, data) => {
    if (err) {
      res
        .status(500)
        .json({ error: "Error searching for faces in collection" });
    } else {
      if (data?.FaceMatches?.length > 0) {
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
  con.query("SELECT * from Students" + appendString, function (err, result) {
    if (err) throw err;
    return res.status(200).json({ body: result });
  });
});

app.post("/add-course", async (req, res) => {
  const { name, code, description, professorId, term, students } = req.body;

  if (students?.length) {
    let studentIdList = "(" + students[0];
    for (let i = 1; i < students.length; ++i) {
      studentIdList += ", ";
      studentIdList += students[i];
    }
    studentIdList += ")";
    console.log("studentIdList", studentIdList);

    const checkForInvalidStudents = new Promise((resolve, reject) => {
      con.query(
        "SELECT COUNT(*) as count FROM student WHERE rollNo IN " +
          studentIdList,
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
      if (validStudentCount !== students.length) {
        return res.status(404).json({ message: "Invalid Students" });
      }
    } catch (err) {
      return res
        .status(500)
        .json({ ...err, message: "invalid students in add-course api" });
    }
  }

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
      return res.status(200).json({ message: "add course successful!" });
    }
  );
});

app.get("/courses", async (req, res) => {
  con.query("SELECT * FROM course", (err, result) => {
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
  const { name, description, id, email } = req.body;
  con.query(
    "insert into professor values (?,?,?,?)",
    [id, name, email, description],
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error adding professor to the rds" });
      }
      return res.status(200).json({ message: "add professor successful!" });
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
  con.query(
    "insert into session values (?,?,?,?,?)",
    [short.generate(), courseId, null, new Date(), true],
    (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ ...err, message: "error inserting session to rds" });
      }
      return res.status(200).json({ message: "session creation successful!" });
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
    `SELECT sessionTimeStamp FROM session WHERE courseId = "${courseId}"`,
    (err, result) => {
      if (err) {
        return res.status(500).json({
          ...err,
          message: "failed to fetch sessionTimeStamp - session-get-api",
        });
      }
      console.log("result", result);
      const sessions = result.map((item) => {
        return { ...courseInfo, timeStamp: item.sessionTimeStamp };
      });
      return res.status(200).json(sessions);
    }
  );
});
