const shell = require('shelljs');
const Listr = require('listr');

process.env.NODE_ENV = 'test';

shell.echo(`
== Running Augur Tests ==
`);

const tests = new Promise((resolve, reject) => {
	shell.exec('mocha --require babel-register', (code, stdout, stderr) => {
		if (code !== 0) {
			reject(new Error());
			shell.exit(code);
		}

		resolve();
	});
});

const tasks = new Listr([
	{
		title: 'Running Tests',
		task: () => tests
	}
]);

tasks.run().catch((err) => {});