var http = require("http");
var fs = require("fs");
var express = require("express");
var app = express();
var expressValidator = require("express-validator");
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3').verbose();
var bcrypt = require('bcryptjs');
var path = require('path');
var nunjucks = require('nunjucks');
var session = require('express-session');
var sequelize = require('sequelize');

// Code for Heroku, need to change to fit in our app
// app.set('port', (process.env.PORT || 3000));
// // app.use(express.static(__dirname + '/public'));
// // views is directory for all template files
// app.set('views', __dirname + '/views');
// app.set('view engine', 'nunjucks');
// app.get('/', function(request, response) {
//   response.render('pages/index')
// });
// app.get('/cool', function(request, response) {
//   response.send(cool());
// });
// app.listen(app.get('port'), function() {
//   console.log('Node app is running on port', app.get('port'));
// });

/*
	this is a list of url to save url which we
	might receive request later
*/
var url_list = ['/', '/index.html'];
var db = new sqlite3.Database('db.sqlite');
db.serialize();
nunjucks.configure('views', { autoescape: true, express: app });

var page = "/";

app.use(express.static(__dirname + '/assets'));
// app.engine('.html', require('ejs').__express);
// app.set('views', __dirname);
// app.set('view engine', 'html');
app.use(session({ secret: 'Who is Ryan', resave: false, saveUninitialized: false }));
// Expose session variables to views
app.use(function(req, res, next) {
  res.locals.session = req.session;
  next();
});


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


app.use(expressValidator({
	customValidators: {
		// isUserName: function(value) {
		// 	var reg = /^[0-9A-Za-z_]{1,32}$/;
        //
		// 	return String(value).search(reg) >= 0;
		// },

		isPassword: function(value) {
			var reg = /^[a-zA-Z0-9]{8,32}$/;
			return String(value).search(reg) >= 0;


		},

        isBirthday: function(value) {
            var reg = /^(19|20)\d\d[-](0[1-9]|1[012])[-](0[1-9]|[12][0-9]|3[01])$/;
            return String(value).search(reg) >= 0;
        }

	}


}));

app.get(url_list[0], function(req, res) {
    res.render('index.html', {  // Note that .html is assumed.
        "errors": ''
    });


//	res.sendFile(__dirname + '/index.html');
});

app.get(url_list[1], function(req, res) {
    res.render('index.html', {  // Note that .html is assumed.
        "errors": ''
    });


//	res.sendFile(__dirname + '/index.html');
});



app.post('/signup', function(req, res) {
	req.assert('email', 'Username is required').notEmpty();
	req.assert('pword', 'Password is required').notEmpty();
    req.assert('birth', 'Birthday is required').notEmpty();

	req.checkBody('email', 'Username is not valid').isEmail();
	req.checkBody('pword', 'Password is not valid').isPassword();
    req.checkBody('birth', 'Birthday is not valid').isBirthday();

    req.check('confirm', 'password is not matched').equals(req.body.pword);

	var err = req.validationErrors();
    var mappedErrors = req.validationErrors(true);

    if (err) // If errors exist, send them back to the form:
    {

        var msgs = { "errors": {} };



        if ( mappedErrors.email )
            msgs.errors.error_email = mappedErrors.email.msg;

        if ( mappedErrors.pword )
            msgs.errors.error_pword = mappedErrors.pword.msg;

        if ( mappedErrors.confirm)
            msgs.errors.error_confirm = mappedErrors.confirm.msg;

        if ( mappedErrors.birth )
            msgs.errors.error_birth = mappedErrors.birth.msg;

        // res.sendFile(__dirname + '/index.html');
        res.status(400);
        res.render('index.html', msgs);


    } else {
		//submit the data to database
        var username = req.body.email.toLowerCase();
        var password = req.body.pword;
        var dob = req.body.birth;
        var result = create_user(username, password, dob, function (err) {
            if (err) {
                req.session.errmsg = err;
                req.session.msg = "";
                res.status(400);
                res.render('index.html');
                req.session.errmsg = "";
            } else {
                req.session.username = username;
                req.session.msg = "Signup successfully!";
                req.session.errmsg = "";
                res.status(200);
                res.redirect(page);
                req.session.msg = "";
            }
        });
	}
});


function create_user(username, password, dob, callback) {

    db.all('SELECT email FROM users WHERE email = ?', [username], function(err, rows) {
        var result;
        if (err) {
            callback(err);
            return;
        }

        if (rows.length > 0) {
            // user already exist
            callback('This username has already existed')
            return;

        } else {
            db.run('INSERT INTO users (email, password, ' +
            'birthday, is_admin) VALUES (?, ?, ?, ?)',
            [username, bcrypt.hashSync(password, 10), dob, 0], function (err) {
                callback(err);
            });
        }
    });
}

app.post('/search_courses', function(req, res) {
	var lenDept = req.body.department.trim().length,
		lenNum = req.body.code.trim().length,
		lenSect = req.body.section.trim().length;

	var msgs = {"errors": {}};

	if (!lenDept && !lenNum && !lenSect) {
		msgs.errors.course_empty = "Please enter in at least 1 field";
		res.render('base.html', msgs);
	} else {
		var offers_course = "";
		if (lenDept) {
			if (offers_course.length) {
				offers_course += ' and ';
			}
			offers_course = offers_course + "lower(dept) like '%" + req.sanitize('department').escape().trim() + "%'";
		}

		if (lenNum) {
			if (offers_course.length) {
				offers_course += ' and ';
			}
			offers_course = offers_course + "num = " + req.sanitize('code').escape().trim();
		}

		if (lenSect) {
			if (offers_course.length) {
				offers_course += ' and ';
			}
			offers_course = offers_course + "lower(sect) like '%" + req.sanitize('section').escape().trim() + "%'";
		}

		var query_offers_course = "SELECT * FROM offers_course WHERE " + offers_course.toLowerCase();

		var result_list = [];

		db.all(query_offers_course, function(err, rows) {
			if (err) throw err;
			result_list.push(rows);


			var recommend_textbook;
			if (lenDept) {
				recommend_textbook = "select o.email as email, o.title as title, o.author as author, o.publisher as publisher from offers_book o, course_textbook c where o.title like c.title and o.author like c.author and lower(c.dept) like '%" + req.sanitize('department').escape().toLowerCase().trim() + "%'"
			};

			if (!req.session.username) {
				if (lenDept) {
					db.all(recommend_textbook, function(err, rows) {
						if (err) throw err;
						result_list.push(rows);

						res.end(JSON.stringify(result_list));
					});
				} else {
					result_list.push([]);
					res.end(JSON.stringify(result_list));
				}

			} else {
				var username = req.session.username;
				db.all("SELECT year_of_study, major FROM users WHERE email = ?",  [ username ], function(err, rows) {

	    			if (lenDept) {
	    				recommend_textbook += " or lower(c.dept) like '%" + rows[0].major +
	    							 "%' and c.num between " + (rows[0].year_of_study * 100) + " and " +
	    							 (rows[0].year_of_study * 100 + 99) + " and email <> '" + username + "'";
	    			} else {
	    				recommend_textbook = "select o.email as email, o.title as title, o.author as author, o.publisher as publisher from offers_book o, course_textbook c where o.title like c.title and o.author like c.author and lower(c.dept) like '%" +
	    									  rows[0].major.trim().toLowerCase() +
	    									  "%' and c.num between " +
	    									  (rows[0].year_of_study * 100) + " and " +
	    							 		  (rows[0].year_of_study * 100 + 99) +
	    							 		  " and email <> '" + username + "'"
	    			}

	            	db.all(recommend_textbook, function(err, rec) {
	            		if (err) console.log(err);
		       			result_list.push(rec);
		       			console.log(rec);
		       			res.end(JSON.stringify(result_list));
	       			});
	       		});
			}
		});
	}

});


app.post('/search_books', function(req, res) {

	var lenTitle = req.body.title.trim().length,
		lenAuthor = req.body.author.trim().length,
		lenPublisher = req.body.publisher.trim().length,
		lenDept = req.body.dept.trim().length,
		lenNum = req.body.num.trim().length;

	var msgs = {"errors": {}};

	if (!lenTitle && !lenAuthor && !lenPublisher && !lenDept && !lenNum) {

	} else {

		var offers_book = "";
		if (lenTitle) {
			if (offers_book.length) {
				offers_book += ' and ';
			}
			offers_book = offers_book + "lower(title) like '%" + req.sanitize('title').escape().trim() + "%'";
		}

		if (lenAuthor) {
			if (offers_book.length) {
				offers_book += ' and ';
			}
			offers_book = offers_book + "lower(author) like '%" + req.sanitize('author').escape().trim() + "%'";
		}

		if (lenPublisher) {
			if (offers_book.length) {
				offers_book += ' and ';
			}
			offers_book = offers_book + "lower(publisher) like '%" + req.sanitize('publisher').escape().trim() + "%'";
		}

		var course_textbook = "";
		if (lenDept && !lenNum) {
			course_textbook = "lower(dept) like '%" + req.sanitize('dept').escape().trim() + "%'";
		} else if (!lenDept&& lenNum) {
			course_textbook = "num = " + req.sanitize('num').escape().trim();
		} else if (lenDept && lenNum) {
			course_textbook = "lower(dept) like '%" + req.sanitize('dept').escape().trim() + "%' and num = " + req.sanitize('num').escape().trim();
		}

		var query_offers_book = "SELECT * FROM offers_book WHERE " + offers_book.toLowerCase();
		var query_course_textbook = "SELECT title, author FROM course_textbook WHERE " + course_textbook.toLowerCase();
		var query_join_offer_textbook = "SELECT o.email as email, o.title as title, o.author as author, o.publisher as publisher FROM offers_book o, (" + query_course_textbook + ") c WHERE o.title = c.title and o.author = c.author";
		var result;
		if (offers_book.length && !course_textbook.length) {
			result = query_offers_book;
		} else if (!offers_book.length && course_textbook.length) {
			result = query_join_offer_textbook;
		} else if (offers_book.length && course_textbook.length) {
			result = query_offers_book + " intersect " + query_join_offer_textbook;
		}

		var result_list = [];
		db.all(result, function(err, rows) {
			if (err) {
                throw err;
            }
            result_list.push(rows);

            if (!req.session.username) {
				result_list.push([]);
                result_list.push([]);
				
				res.end(JSON.stringify(result_list));
			} else {
				var username = req.session.username;
				db.all("SELECT year_of_study, major FROM users WHERE email = ?",  [ username ], function(err, rows) {

	    			var recommend = "select * from offers_course where lower(dept) = '" + rows[0].major + "' and num between " + rows[0].year_of_study * 100 + " and " + (rows[0].year_of_study * 100 + 99) + " and email <> '" + username + "'";
	            	db.all(recommend, function(err, rec) {
		       			result_list.push(rec);
		       			res.end(JSON.stringify(result_list));
	       			});
	       		});
			}
		});
	}

});


app.post('/like', function(req, res) {
    var emailText = req.body.email,
        bookTitleText = req.body.title,
        bookAuthorText = req.body.author;

    var email = emailText.substring(21, emailText.length),
        bookTitle = bookTitleText.toLowerCase(),
        bookAuthor = bookAuthorText.substring(4, bookAuthorText.length).toLowerCase(),
        user = req.session.username;

    db.run("insert into book_likes(email, title, author, user) values (?, ?, ?, ?)", [email, bookTitle, bookAuthor, user], function(err) {
        if (err) console.log(err);
    });

    db.all("select user from book_likes where email = ? and lower(title) = ? and lower(author) = ?", [email, bookTitle, bookAuthor], function(err, rows) {
        
        if (err) { 
            console.log(err)
        } else {
            console.log(rows);
            res.end(JSON.stringify(rows));
        }
        
    });

});

app.post('/get_book_comment', function(req, res) {

    var emailText = req.body.email,
        bookTitleText = req.body.title,
        bookAuthorText = req.body.author;


    var email = emailText.substring(21, emailText.length),
        bookTitle = bookTitleText.toLowerCase(),
        bookAuthor = bookAuthorText.substring(4, bookAuthorText.length).toLowerCase();

    db.all("select * from book_comments where email = ? and lower(title) = ? and lower(author) = ?", [email, bookTitle, bookAuthor], function(err, rows) {
        if (err) throw err;
        if (rows.length > 0) {
            res.end(JSON.stringify(rows));
        } else {
            empty_result = {"email": email, "title": bookTitle, "author": bookAuthor};
            console.log(JSON.stringify(empty_result));
            res.end(JSON.stringify(empty_result));

        }
    });
});

app.post("/post_book_comment", function(req, res) {
    var user = req.session.username,
        email = req.body.email,
        bookTitle = req.body.title,
        bookAuthor = req.body.author,
        comment = req.sanitize('comment').escape();

    var time = new Date(Date.now()).toString();

    db.run("insert into book_comments(email, title, author, user, comments, time) values(?, ?, ?, ?, ?, ?)", [email, bookTitle, bookAuthor, user, comment, time], function(err) {
        if (err) {
            res.status(400);
            req.session.errmsg = "Comment failed.";
            req.session.msg = "";
            res.redirect(page);
            req.session.errmsg = "";
        } else {    
            console.log("redirect?")
            res.status(200);
            req.session.msg = "Comment successfully";
            req.session.errmsg = "";
            res.redirect(page);
            req.session.msg = "";
        }


    });

});


app.post('/signin', function(req, res) {
	req.assert('mail', 'Username is required').notEmpty();
	req.assert('password', 'Password is required').notEmpty();


	req.checkBody('mail', 'Username is not valid').isEmail();
	req.checkBody('password', 'Password is not valid').isPassword();


	var err = req.validationErrors();
    var mappedErrors = req.validationErrors(true);

    if (err) // If errors exist, send them back to the form:
    {
        var msgs = { "errors": {} };

        if ( mappedErrors.mail )
            msgs.errors.error_mail = mappedErrors.mail.msg;

        if ( mappedErrors.password )
            msgs.errors.error_password = mappedErrors.password.msg;


        // res.sendFile(__dirname + '/index.html');
        res.status(400);
        res.render('index.html', msgs);

    } else {
		//submit the data to database
        var username = req.sanitize('mail').escape().trim().toLowerCase();
        db.all("SELECT email, password, birthday, is_admin FROM users WHERE email = ?",  [ username ], function(err, rows) {
            if (err) {

                res.status(400);
                res.redirect(page);
            }
            if(!rows || rows.length > 1) {

                res.status(400);
                res.redirect(page);
            }

            if (rows.length === 1 && bcrypt.compareSync(req.sanitize('password').escape().trim(), rows[0].password)
                && req.sanitize('dob').escape().trim() === rows[0].birthday) {

                if (rows[0].is_admin === 0) {
                    req.session.username = username;
                    req.session.is_admin = 0;
                    res.status(200);
                    res.redirect(page);
                } else if (rows[0].is_admin === 1) {
                    req.session.username = username;
                    req.session.is_admin = 1;
                    res.status(200);
                    page = "/admin"
                    res.redirect(page);
                } else {
                    res.sendStatus(404);
                    res.redirect(page);
                }
            } else {
                var err = req.validationErrors();
                var msgs = { "errors": {} };
                msgs.errors.error_password = "Information is not correct!";
                res.status(400);
                res.render('index.html', msgs);
            }
        });
	}
});



app.get('/signout', function(req, res) {
    req.session.destroy();
    page = '/'
    res.status(200);
    res.redirect(page);
});

app.post('/feedback', function(req, res) {
    req.assert('feedback', 'Username is required').notEmpty();
	var err = req.validationErrors();
    if (err) {
        req.session.errmsg = "Feedback submit err, cannot be empty";
        req.session.msg = "";
        res.status(400);
        res.redirect(page);
        req.session.errmsg = "";
    } else {
        var feedback = req.sanitize('feedback').escape().trim();
        feedback.substring(0, 500);
        var time = new Date(Date.now()).toString();
        if (feedback) {
            db.run('INSERT INTO feedbacks (feedback, time) VALUES (?, ?)', [ feedback, time ], function (err){
                if (err) {
                    req.session.errmsg = "Feedback submit err";
                    req.session.msg = "";
                    res.status(400);
                    res.redirect(page);
                    req.session.errmsg = "";
                } else {
                    req.session.msg = "Feedback submit success! Thank you for your feedback.";
                    req.session.errmsg = "";
                    res.status(200);
                    res.redirect(page);
                    req.session.msg = "";
                }
            });
        }
    }
});

app.get('/profile', function(req, res) {

    if (!req.session.username) {
        // hasn't login yet
        res.status(400);
        res.redirect(page);
    } else {
        var result = [];
        var username = req.session.username;

        db.all("SELECT email, password, birthday, phone, year_of_study, major FROM users WHERE email = ?",  [ username ], function(err, rows) {
            result.push(rows);
        });

        db.all("SELECT email, dept, num, title, sect FROM offers_course WHERE email = ?",  [ username ], function(err, rows) {
            result.push(rows);
        });

        db.all("SELECT email, title, author, publisher FROM offers_book WHERE email = ?",  [ username ], function(err, rows) {
            result.push(rows);
            res.status(200);
            res.end(JSON.stringify(result));

        });
    }
});

app.post('/message', function(req, res) {
    if (!req.session.username) {
        res.status(400);
    } else {

        var result = [];
        var username = req.session.username;
        db.all("SELECT user1, user2, message, time FROM messages WHERE user2 = ?",  [ username ], function(err, rows) {
            result.push(rows);
            res.status(200);
            res.end(JSON.stringify(result));
        });
    }
});

app.post('/follows', function(req, res) {
    if (!req.session.username) {
        res.status(400);
    } else {
        var result = [];
        var username = req.session.username;
        db.all("SELECT user1, user2 FROM follows WHERE user1 = ?",  [ username ], function(err, rows) {
            result.push(rows);
            // res.end(JSON.stringify(result));
        });
        db.all("SELECT user1, user2 FROM follows WHERE user2 = ?",  [ username ], function(err, rows) {
            result.push(rows);
            res.status(200);
            res.end(JSON.stringify(result));
        });
    }
});

app.post('/sendmsg', function(req, res) {
    if (!req.session.username) {
        res.status(400);
    } else {
        req.assert('receiver', 'receiver').notEmpty();
        req.assert('mymessage', 'message').notEmpty();
    	var err = req.validationErrors();
        if (err) {
            req.session.errmsg = "Send message failed";
            req.session.msg = "";
            res.status(400);
            res.redirect(page);
            req.session.errmsg = "";
        } else {
            var receiver = req.sanitize('receiver').escape().trim();
            var username = req.session.username;
            var message = req.sanitize('mymessage').escape().trim();
            db.all("SELECT email FROM users WHERE email = ?",  [ receiver ], function(err, rows) {
                if (rows.length > 0) {
                    var result = [];
                    db.run('INSERT INTO messages (user1, user2, message, time) VALUES (?, ?, ?, ?)', [ username, receiver, message, new Date(Date.now()).toString()], function (err){

                        if (err) {
                            req.session.errmsg = "Send message failed";
                            req.session.msg = "";
                            res.status(400);
                            res.redirect(page);
                            req.session.errmsg = "";
                        } else {
                            req.session.msg = "Send successfully!";
                            req.session.errmsg = "";
                            res.status(200);
                            res.redirect(page);
                            req.session.msg = "";
                        }
                    });
                } else {
                    // cannot find this user
                    req.session.errmsg = "Send message failed, cannot find this receiver.";
                    res.status(400);
                    res.redirect(page);
                    req.session.errmsg = "";
                }
            });
        }
    }
});


app.post('/follow', function(req, res) {
    if (!req.session.username) {
        res.sendStatus(404);
    } else {
        var receiver = req.sanitize('friend').escape().trim().toLowerCase();
        var username = req.session.username;
        db.all("SELECT email FROM users WHERE email = ?",  [ receiver ], function(err, rows) {
            if (rows.length > 0) {
                db.run('INSERT INTO follows (user1, user2) VALUES (?, ?)', [ username, receiver], function (err){
                    if (err) {
                        req.session.errmsg = "Follow failed, you're already friends";
                        req.session.msg = "";
                        res.status(400);
                        res.redirect(page);
                        req.session.errmsg = "";
                    } else {
                        req.session.msg = "Follow successfully!";
                        res.status(200);
                        req.session.errmsg = "";
                        res.redirect(page);
                        req.session.msg = "";
                    }
                });
            } else {
                // cannot find this user
                req.session.errmsg = "Follow friend failed, cannot find this user.";
                res.status(400);
                req.session.msg = "";
                res.redirect(page);
                req.session.errmsg = "";
            }
        });
    }
});

app.post('/add_book', function(req, res) {
    if (!req.session.username) {
        res.status(404);
        res.redirect(page);
    } else {
        var title = req.sanitize('title').escape().trim();
        var author = req.sanitize('author').escape().trim();
        var publisher = req.sanitize('publisher').escape().trim();
        var username = req.session.username;
        var dept = req.sanitize('dept').escape().trim();
        var num = req.sanitize('num').escape().trim();

        db.all("SELECT email, title, author FROM offers_book WHERE email = ? AND title = ? AND author = ?",  [ username, title, author ], function(err, rows) {
            console.log(JSON.stringify(rows));
            if (!(rows.length > 0)) {

                db.run('INSERT INTO offers_book (email, title, author, publisher) VALUES (?, ?, ?, ?)', [ username, title, author, publisher], function (err){
                    if (err) {
                        req.session.errmsg = "Add failed. " + err;
                        req.session.msg = "";
                        res.status(400);
                        res.redirect(page);
                        req.session.errmsg = "";
                    } else {
                        if (!dept || !num) {
                            req.session.msg = "Add offered book successfully!";
                            req.session.errmsg = "";
                            res.status(200);
                            res.redirect(page);
                            req.session.msg = "";
                        } else if (dept && num) {
                            db.run('INSERT INTO course_textbook (dept, num, title, author) VALUES (?, ?, ?, ?)', [ dept, num, title, author ], function (err) {
                                if(err) {
                                    // doing nothing, our database has already have this book
                                }
                                req.session.msg = "Add offered book successfully!";
                                req.session.errmsg = "";
                                res.status(200);
                                res.redirect(page);
                                req.session.msg = "";

                            });

                        } else {
                            req.session.errmsg = "Add failed. ";
                            res.status(400);
                            req.session.msg = "";
                            res.redirect(page);
                            req.session.errmsg = "";
                        }

                    }
                });
            } else {
                // cannot find this user
                req.session.errmsg = "Add book failed.";
                req.session.msg = "";
                res.status(400);
                res.redirect(page);
                req.session.errmsg = "";
            }
        });
    }
});

app.post('/add_course', function(req, res) {
    if (!req.session.username) {
        res.status(404);
        res.redirect(page);
    } else {
        var dept = req.sanitize('department').escape().trim();
        var code = req.sanitize('code').escape().trim();
        var section = req.sanitize('section').escape().trim();
        var username = req.session.username;
        var course_title = req.sanitize('course_title').escape().trim();

        db.all("SELECT email, dept, num FROM offers_course WHERE email = ? AND dept = ? AND num = ?",  [ username, dept, code ], function(err, rows) {
            if (!(rows.length > 0)) {
                db.run('INSERT INTO offers_course (email, dept, num, title, sect) VALUES (?, ?, ?, ?, ?)', [ username, dept, code, course_title, section ], function (err){
                    if (err) {
                        req.session.errmsg = "Add failed. " + err;
                        req.session.msg = "";
                        res.status(400);
                        res.redirect(page);
                        req.session.errmsg = "";
                    } else {
                        req.session.msg = "Add offered course successfully!";
                        req.session.errmsg = "";
                        res.status(200);
                        res.redirect(page);
                        req.session.msg = "";
                    }
                });
            } else {
                // cannot find this user
                req.session.errmsg = "Add course failed. You've already offered this course";
                res.status(400);
                req.session.msg = "";
                res.redirect(page);
                req.session.errmsg = "";
            }
        });
    }
});

app.get("/admin", function(req, res) {
    if (req.session.is_admin === 1) {
        res.render('admin.html', {
            "errors": ''
        });
    } else {
        res.status(403).send("You are not admin, cannot access this page.");

    }
});


app.post("/userList", function(req, res) {
    if (req.session.is_admin === 1) {
        db.all("SELECT email FROM users WHERE is_admin <> 1", function(err, rows) {
            res.status(200);
            res.end(JSON.stringify(rows));
        });
    } else {
        res.status(403).send("You are not admin, cannot access this page.");
    }
});

app.post("/userInfo", function(req, res) {

    if (req.session.is_admin === 1) {
        var target = req.body.target;

        db.all("SELECT email, password, birthday, phone, year_of_study, major FROM users WHERE email=?", [ target ],function(err, rows) {
            res.status(200);
            res.end(JSON.stringify(rows));
        });
    } else {
        res.status(403).send("You are not admin, cannot access this page.");
    }
});

app.post("/changeInfo", function(req, res) {
    var username = req.sanitize('user_email').escape().trim();
    var password =  emptyStringToNull(req.sanitize('user_password').escape().trim());
    var birthday =  emptyStringToNull(req.sanitize('user_birthday').escape().trim());
    var phone =  emptyStringToNull(req.sanitize('user_phone').escape().trim());
    var year =  emptyStringToNull(req.sanitize('user_year_of_study').escape().trim());
    var major =  emptyStringToNull(req.sanitize('user_major').escape().trim());
    if (req.session.is_admin === 1) {
        updateInfo(password, birthday, phone, year, major, username, req, res);
    } else {

        if (req.session.username === username) {
            updateInfo(password, birthday, phone, year, major, username, req, res);
        } else {
            //should not be happened, unless hacker trying to access
            res.status(403).send("You are not admin, cannot access this page.");
        }
    }
})

app.post("/get_user_profile", function(req, res) {
    var email = req.sanitize('email').escape().trim();

    var result = [];
    db.all("SELECT email, phone, year_of_study, major FROM users WHERE email = ?",  [ email ], function(err, rows) {
        result.push(rows);
    });

    db.all("SELECT email, dept, num, title, sect FROM offers_course WHERE email = ?",  [ email ], function(err, rows) {
        result.push(rows);
    });

    db.all("SELECT email, title, author, publisher FROM offers_book WHERE email = ?",  [ email ], function(err, rows) {
        result.push(rows);
        res.status(200);
        console.log(result);
        res.end(JSON.stringify(result));
    });
});

app.post("/getFeedback", function(req, res) {
    if (req.session.is_admin === 1) {

        db.all("SELECT feedback, time FROM feedbacks", function(err, rows) {
            res.status(200);
            res.end(JSON.stringify(rows));
        });
    } else {
        res.status(403).send("You are not admin, cannot access this page.");
    }
});

function updateInfo(password, birthday, phone, year, major, username, req, res) {
    if (birthday) {
        if (password) {
            db.all("UPDATE users SET password=?, birthday=?, phone=?, " +
                "year_of_study=?, major=? WHERE email=?",
                [ bcrypt.hashSync(password, 10), birthday,
                    phone, year, major, username ],function(err, rows) {
                if (err) {
                    req.session.errmsg = "Update failed. " + err + " Please contact the admin";
                    req.session.msg = "";
                    res.status(400);
                    res.redirect(page);
                    req.session.errmsg = "";
                } else {
                    req.session.msg = "Update successfully!";
                    req.session.errmsg = "";
                    res.status(200);
                    res.redirect(page);
                    req.session.msg = "";
                }
            });
        } else {
            db.all("UPDATE users SET birthday=?, phone=?, " +
                "year_of_study=?, major=? WHERE email=?",
                [ birthday, phone, year, major, username ],function(err, rows) {
                if (err) {
                    req.session.errmsg = "Update failed. " + err + " Please contact the admin";
                    req.session.msg = "";
                    res.status(400);
                    res.redirect(page);
                    req.session.errmsg = "";
                } else {
                    req.session.msg = "Update successfully!";
                    res.status(200);
                    req.session.errmsg = "";
                    res.redirect(page);
                    req.session.msg = "";
                }
            });
        }
    } else {
        req.session.errmsg = "Update failed. Notice that birthday cannot be empty";
        req.session.msg = "";
        res.status(400);
        res.redirect(page);
        req.session.errmsg = "";
    }

}
function emptyStringToNull(value) {
    if (value === "") {
        return null;
    } else {
        return value;
    }
}

var server = app.listen(process.env.PORT || 3000, function()
{
  var port = server.address().port;
  console.log('Running on 127.0.0.1:%s', port);
});