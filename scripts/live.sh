#!/bin/bash

cd /project/test/fixtures/basic
grits -v \
	-P 3955 \
	--plugin "grits-plugin-pdf" \
	.


